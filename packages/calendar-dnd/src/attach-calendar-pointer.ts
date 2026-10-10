import {
  eventPlacement,
  formatPlacementRange,
  type CalendarAnnouncer,
  type CalendarEventPlacement,
  type CalendarEventProposal,
  type CalendarInteractionUpdate,
  type CalendarTransactionResult,
  type EventId,
  type EventSnapshot,
  type NormalizedCalendarEvent,
  type ResourceId,
  type TimeGridColumn,
} from "@moltenship/calendar-core";
import type { WallTimeSnapOptions } from "@moltenship/calendar-temporal";

import { autoScroll, scrollableAncestor } from "./auto-scroll";
import { eventIdOf } from "./event-id";
import {
  createdPlacement,
  movedPlacement,
  resizedPlacement,
  type GestureOptions,
  type PointerTarget,
} from "./gestures";
import { ghostLayout, GhostLayer } from "./ghost";
import { targetAt, type TargetSurface } from "./targets";

export interface CalendarPointerOptions<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> {
  /** Events as rendered, pending changes included; resolves `data-event-id`. */
  readonly events: EventSnapshot<TEvent, TEventId, TResourceId>;
  /**
   * Receives one proposal per completed drag. Clicks and cancelled drags propose nothing. Return
   * the transaction's result, as `proposeEventChange` does, to announce whether it was saved.
   */
  readonly onPropose: (
    proposal: CalendarEventProposal<TEventId, TResourceId>,
  ) => void | PromiseLike<CalendarTransactionResult<TEvent, TEventId, TResourceId>>;
  /** The display time zone. */
  readonly timeZone: string;
  /**
   * Speaks each drag's start, steps, and outcome, and labels the preview's time range; pass
   * `useCalendarAnnouncer()`. Without one, ranges are formatted in the runtime's locale.
   */
  readonly announcer?: CalendarAnnouncer;
  /**
   * Day columns of the time axis, matched to `[data-date]` elements without `data-all-day`: a
   * time grid's or a timeline's `columns`.
   */
  readonly columns?: readonly TimeGridColumn[];
  readonly disabled?: boolean;
  /** Extra classes for the preview segments. */
  readonly ghostClassName?: string;
  /**
   * A ref to the element scrolled while dragging near its edges. Defaults to the nearest scrollable
   * ancestor of where the drag starts.
   */
  readonly scrollContainer?: { readonly current: Element | null };
  /** Wall-clock grid for time columns. Defaults to 15 minutes. */
  readonly snap?: WallTimeSnapOptions;
}

interface EventGesture<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly element: HTMLElement;
  readonly event: NormalizedCalendarEvent<TEvent, TEventId, TResourceId>;
  readonly grab: PointerTarget;
  readonly original: CalendarEventPlacement<TResourceId>;
}

type Gesture<TEvent, TEventId extends EventId, TResourceId extends ResourceId> =
  | { readonly anchor: PointerTarget; readonly kind: "create" }
  | (EventGesture<TEvent, TEventId, TResourceId> & { readonly kind: "move" })
  | (EventGesture<TEvent, TEventId, TResourceId> & {
      readonly edge: "start" | "end";
      readonly kind: "resize";
    });

interface Session<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  active: boolean;
  readonly announcer: CalendarAnnouncer | undefined;
  frame?: number;
  readonly gesture: Gesture<TEvent, TEventId, TResourceId>;
  readonly ghost: GhostLayer;
  longPress?: ReturnType<typeof setTimeout>;
  readonly options: GestureOptions;
  readonly origin: { readonly x: number; readonly y: number };
  /** What a drop would propose; `null` off the view or over the gesture's other axis. */
  placement: CalendarEventPlacement<TResourceId> | null;
  point: { readonly x: number; readonly y: number };
  readonly pointerId: number;
  readonly pointerType: string;
  readonly scrollContainer: Element;
  readonly surface: TargetSurface;
}

const DEFAULT_SNAP: WallTimeSnapOptions = { increment: 15, smallestUnit: "minute" };
/** Pointer travel that turns a mouse or pen press into a drag; anything less is a click. */
const DRAG_DISTANCE = 4;
/** Touch drags start after a still long-press, so a swipe keeps scrolling. */
const LONG_PRESS_MS = 250;
const TOUCH_TOLERANCE = 8;

function preventDefault(event: Event): void {
  event.preventDefault();
}

/** Swallows the click that follows a drag, so dropping an event does not also open it. */
function suppressNextClick(): void {
  const swallow = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  window.addEventListener("click", swallow, { capture: true, once: true });
  setTimeout(() => window.removeEventListener("click", swallow, { capture: true }));
}

function samePlacement(left: CalendarEventPlacement, right: CalendarEventPlacement): boolean {
  return (
    left.kind === right.kind &&
    left.start.toString() === right.start.toString() &&
    left.end.toString() === right.end.toString() &&
    left.resourceIds.length === right.resourceIds.length &&
    left.resourceIds.every((resourceId) => right.resourceIds.includes(resourceId))
  );
}

/**
 * The event an element renders. Without `data-event-id-type`, an ID that only exists as a number
 * still resolves, which keeps all-numeric calendars working with plain `data-event-id`.
 */
function resolveEvent<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(
  events: EventSnapshot<TEvent, TEventId, TResourceId>,
  element: Element,
): NormalizedCalendarEvent<TEvent, TEventId, TResourceId> | undefined {
  const id = eventIdOf(element) as TEventId;
  const numeric = Number(id);
  return (
    events.get(id) ??
    (typeof id === "string" && Number.isFinite(numeric)
      ? events.get(numeric as TEventId)
      : undefined)
  );
}

/**
 * Adds pointer move, resize, and create to a rendered view through delegated listeners on one
 * region. The view marks its parts with data attributes:
 *
 * - `data-event-id` on events (spread `eventIdAttributes(id)` to keep numeric IDs distinct), with
 *   `data-resize="start"` or `"end"` on resize handles;
 * - `data-date` (an ISO date) on time-grid day columns and on day cells (month cells, or a time
 *   grid's all-day row, which also carries `data-all-day`); a time column with
 *   `data-axis="inline"`, such as a timeline's strip for one date, runs its day from the inline
 *   start, the right under `dir="rtl"`;
 * - in a resource view, `data-resource-id` on each cell or an element around it (spread
 *   `resourceIdAttributes(id)`), so a drop in another resource swaps it in the event's
 *   `resourceIds` and a create starts in the resource it began in;
 * - `data-event-time` on the element inside an event that shows its time range, which the
 *   preview relabels with the proposed range.
 *
 * The preview moves without re-rendering. `onPropose` runs once per drop; a click (less than a few
 * pixels of travel) is left alone, and Escape cancels. Touch drags start with a long-press.
 * Returns a function that detaches everything.
 */
export function attachCalendarPointer<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
>(
  region: HTMLElement,
  getOptions: () => CalendarPointerOptions<TEvent, TEventId, TResourceId>,
): () => void {
  let session: Session<TEvent, TEventId, TResourceId> | null = null;

  function placementAt(
    current: Session<TEvent, TEventId, TResourceId>,
    target: PointerTarget,
  ): CalendarEventPlacement<TResourceId> | null {
    const { gesture, options } = current;
    if (gesture.kind === "create") return createdPlacement(gesture.anchor, target, options);
    return gesture.kind === "move"
      ? movedPlacement(gesture.original, gesture.grab, target, options)
      : resizedPlacement(gesture.original, gesture.edge, gesture.grab, target, options);
  }

  function announce(
    current: Session<TEvent, TEventId, TResourceId>,
    detail:
      | { readonly phase: "cancel" | "start" | "step" }
      | { readonly phase: "commit"; readonly proposed: CalendarEventPlacement }
      | { readonly phase: "reject"; readonly reason: string },
  ): void {
    const { gesture } = current;
    current.announcer?.announce({
      cause:
        gesture.kind !== "resize"
          ? gesture.kind
          : gesture.edge === "start"
            ? "resize-start"
            : "resize-end",
      event: gesture.kind === "create" ? null : gesture.event,
      input: "pointer",
      original: gesture.kind === "create" ? null : gesture.original,
      proposed: current.placement,
      ...detail,
    } as CalendarInteractionUpdate);
  }

  /** Shows where a drop would land; returns whether that changed. */
  function preview(current: Session<TEvent, TEventId, TResourceId>, scrolled = false): boolean {
    const target = targetAt(current.surface, current.point.x, current.point.y);
    const placement = target === null ? null : placementAt(current, target);
    if (placement === null) {
      // Nothing to drop here, so show nothing rather than the last valid spot.
      const changed = current.placement !== null;
      current.placement = null;
      current.ghost.clear();
      return changed;
    }
    const changed = current.placement === null || !samePlacement(current.placement, placement);
    if (!scrolled && !changed) return false;

    current.placement = placement;
    const { gesture } = current;
    const layout = ghostLayout(current.surface, placement, current.options.timeZone);
    const template = layout.axis === "time" && gesture.kind !== "create" ? gesture.element : null;
    const label =
      template === null
        ? null
        : (current.announcer?.formatRange(placement) ??
          formatPlacementRange(placement, { timeZone: current.options.timeZone }));
    current.ghost.render(layout.rects, template, label);
    return changed;
  }

  function scrollFrame(): void {
    const current = session;
    if (current === null) return;
    if (
      autoScroll(current.scrollContainer, current.point.x, current.point.y) &&
      preview(current, true)
    ) {
      announce(current, { phase: "step" });
    }
    current.frame = requestAnimationFrame(scrollFrame);
  }

  function activate(current: Session<TEvent, TEventId, TResourceId>): void {
    clearTimeout(current.longPress);
    current.active = true;
    region.setAttribute("data-interaction", current.gesture.kind);
    if (current.gesture.kind !== "create") {
      current.gesture.element.setAttribute("data-dragging", "");
    }
    getSelection()?.removeAllRanges();
    window.addEventListener("touchmove", preventDefault, { passive: false });
    current.frame = requestAnimationFrame(scrollFrame);
    preview(current);
    announce(current, { phase: "start" });
  }

  function end(): void {
    const current = session;
    if (current === null) return;
    session = null;

    clearTimeout(current.longPress);
    if (current.frame !== undefined) cancelAnimationFrame(current.frame);
    current.ghost.clear();
    region.removeAttribute("data-interaction");
    if (current.gesture.kind !== "create") current.gesture.element.removeAttribute("data-dragging");

    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", cancel);
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("touchmove", preventDefault);
    for (const type of ["contextmenu", "dragstart", "selectstart"]) {
      window.removeEventListener(type, preventDefault);
    }
  }

  /** Ends the gesture without proposing anything. */
  function cancel(): void {
    if (session?.active === true) announce(session, { phase: "cancel" });
    end();
  }

  function proposal(
    current: Session<TEvent, TEventId, TResourceId>,
  ): CalendarEventProposal<TEventId, TResourceId> | null {
    const { gesture, placement } = current;
    if (placement === null) return null;
    if (gesture.kind === "create") return { cause: "create", proposed: placement };
    if (samePlacement(placement, gesture.original)) return null;
    return {
      cause:
        gesture.kind === "move" ? "move" : gesture.edge === "start" ? "resize-start" : "resize-end",
      eventId: gesture.event.id,
      proposed: placement,
    };
  }

  function onPointerMove(event: PointerEvent): void {
    const current = session;
    if (current === null || event.pointerId !== current.pointerId) return;
    current.point = { x: event.clientX, y: event.clientY };
    if (current.active) {
      if (preview(current)) announce(current, { phase: "step" });
      return;
    }

    const distance = Math.hypot(event.clientX - current.origin.x, event.clientY - current.origin.y);
    if (current.pointerType === "touch") {
      // Moving before the long-press completes is a scroll, not a drag.
      if (distance > TOUCH_TOLERANCE) end();
    } else if (distance > DRAG_DISTANCE) {
      activate(current);
    }
  }

  function onPointerUp(event: PointerEvent): void {
    const current = session;
    if (current === null || event.pointerId !== current.pointerId) return;
    if (!current.active) {
      end();
      return;
    }

    current.point = { x: event.clientX, y: event.clientY };
    preview(current);
    const proposed = proposal(current);
    end();
    suppressNextClick();
    if (proposed === null) {
      announce(current, { phase: "cancel" });
      return;
    }
    const outcome = getOptions().onPropose(proposed);
    if (outcome === undefined) {
      announce(current, { phase: "commit", proposed: current.placement! });
      return;
    }
    void Promise.resolve(outcome).then((result) =>
      announce(
        current,
        result.status === "committed"
          ? { phase: "commit", proposed: result.change.proposed! }
          : { phase: "reject", reason: result.reason },
      ),
    );
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key !== "Escape" || session === null) return;
    event.preventDefault();
    event.stopPropagation();
    const wasActive = session.active;
    cancel();
    if (wasActive) window.addEventListener("pointerup", suppressNextClick, { once: true });
  }

  function gestureFor(
    pressed: Element,
    target: PointerTarget,
    events: EventSnapshot<TEvent, TEventId, TResourceId>,
  ): Gesture<TEvent, TEventId, TResourceId> | null {
    const element = pressed.closest<HTMLElement>("[data-event-id]");
    if (element === null || !region.contains(element)) return { anchor: target, kind: "create" };

    const event = resolveEvent(events, element);
    if (event === undefined || event.isReadOnly) return null;
    const base = { element, event, grab: target, original: eventPlacement(event) };
    const handle = pressed.closest("[data-resize]");
    const edge =
      handle !== null && element.contains(handle) ? handle.getAttribute("data-resize") : null;
    return edge === "start" || edge === "end"
      ? { ...base, edge, kind: "resize" }
      : { ...base, kind: "move" };
  }

  function onPointerDown(event: PointerEvent): void {
    if (session !== null || event.button !== 0 || !event.isPrimary) return;
    const options = getOptions();
    if (options.disabled === true || !(event.target instanceof Element)) return;

    const surface: TargetSurface = {
      clippers: new Map(),
      columns: new Map((options.columns ?? []).map((column) => [column.date.toString(), column])),
      region,
    };
    const target = targetAt(surface, event.clientX, event.clientY);
    const gesture = target === null ? null : gestureFor(event.target, target, options.events);
    if (gesture === null) return;

    const current: Session<TEvent, TEventId, TResourceId> = {
      active: false,
      announcer: options.announcer,
      gesture,
      ghost: new GhostLayer(region, options.ghostClassName),
      options: { snap: options.snap ?? DEFAULT_SNAP, timeZone: options.timeZone },
      origin: { x: event.clientX, y: event.clientY },
      placement: null,
      point: { x: event.clientX, y: event.clientY },
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      scrollContainer: options.scrollContainer?.current ?? scrollableAncestor(event.target),
      surface,
    };
    session = current;

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", onKeyDown, true);
    for (const type of ["contextmenu", "dragstart", "selectstart"]) {
      window.addEventListener(type, preventDefault);
    }
    if (event.pointerType === "touch") {
      current.longPress = setTimeout(() => activate(current), LONG_PRESS_MS);
    }
  }

  region.addEventListener("pointerdown", onPointerDown);
  return () => {
    end();
    region.removeEventListener("pointerdown", onPointerDown);
  };
}
