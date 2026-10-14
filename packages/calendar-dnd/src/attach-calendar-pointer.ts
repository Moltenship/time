import {
  eventPlacement,
  formatPlacementRange,
  type CalendarAnnouncer,
  type CalendarEventPlacement,
  type CalendarDraft,
  type CalendarEventProposal,
  type CalendarInteractionCheck,
  type CalendarInteractionUpdate,
  type CalendarPolicyResult,
  type CalendarProposalDetail,
  type CalendarTransactionResult,
  type EventId,
  type EventSnapshot,
  type NormalizedCalendarEvent,
  type ResourceId,
  type TimeGridColumn,
} from "@moltenship/calendar-core";
import type { WallTimeSnapOptions } from "@moltenship/calendar-temporal";

import { autoScroll, EdgeArming, scrollableAncestor } from "./auto-scroll";
import {
  claimed,
  followersOf,
  tellFollowers,
  type CalendarDragFollower,
  type CalendarDragPreview,
  type CalendarEventDrag,
  type CalendarPoint,
  type CalendarRect,
} from "./drags";
import { eventIdOf } from "./event-id";
import {
  createdPlacement,
  movedPlacement,
  resizedPlacement,
  samePlacement,
  type GestureOptions,
  type PointerTarget,
} from "./gestures";
import { ghostLayout, GhostLayer, ghostValidity, type GhostRect } from "./ghost";
import { settleProposal, type ProposalOutcome } from "./outcome";
import { registerRegion, type PointerRegion } from "./regions";
import { columnsByDate, targetAt, type TargetSurface } from "./targets";

export interface CalendarPointerOptions<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> {
  /** Events as rendered, pending changes included; resolves `data-event-id`. */
  readonly events: EventSnapshot<TEvent, TEventId, TResourceId>;
  /**
   * Receives one proposal per completed drag, with `{ input: "pointer" }`. Clicks and cancelled
   * drags propose nothing. An item dragged in from outside the calendar (`startCalendarDrop`)
   * proposes here too, a create carrying its record as `event`, with the input that drove it.
   * Return the transaction's result, as `proposeEventChange` does, to announce whether it was
   * saved.
   */
  readonly onPropose: (
    proposal: CalendarEventProposal<TEventId, TResourceId, TEvent>,
    detail: CalendarProposalDetail,
  ) => void | PromiseLike<CalendarTransactionResult<TEvent, TEventId, TResourceId>>;
  /** The display time zone. */
  readonly timeZone: string;
  /**
   * Speaks each drag's start, steps, and outcome, and labels the preview's time range; pass
   * `useCalendarAnnouncer()`. Without one, ranges are formatted in the runtime's locale.
   */
  readonly announcer?: CalendarAnnouncer;
  /**
   * Asks the root's policies about the proposal a drop would make, so the preview shows whether
   * it would be saved: pass `actions.checkEventChange`. Preview segments get `data-invalid` when
   * a policy rejects it and `data-warning` when one flags it.
   */
  readonly check?: (
    proposal: CalendarEventProposal<TEventId, TResourceId, TEvent>,
  ) => CalendarPolicyResult<TEvent, TEventId, TResourceId> | null;
  /**
   * Day columns of the time axis, matched to `[data-date]` elements without `data-all-day`: a
   * time grid's or a timeline's `columns`. A new array mid-gesture is picked up, as a view that
   * renders more days while a drag scrolls it needs.
   */
  readonly columns?: readonly TimeGridColumn[];
  /**
   * Turns gestures off. It's also read when the layer attaches: a region disabled then doesn't
   * listen for touch moves, which a drag needs on iOS, so attach again when it changes, as
   * `useCalendarPointer` does.
   */
  readonly disabled?: boolean;
  /**
   * Hears the draft as the preview moves: once per change of where a drop would land, and `null`
   * when the gesture ends or leaves the view. Pass `useCalendarDraftReporter()` so the root's
   * draft hooks, such as `useDraftBusy`, follow pointer drags too.
   */
  readonly onPreview?: (draft: CalendarDraft<TEventId, TResourceId> | null) => void;
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

/**
 * The copy of a moved event that follows the pointer outside the view: its size, and the press
 * within it.
 */
interface Floating {
  readonly height: number;
  readonly offset: CalendarPoint;
  readonly width: number;
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
  /** What the policies say about the drop the preview shows. */
  check: CalendarInteractionCheck;
  /** Whether a follower claimed the pointer at the last preview. */
  claimed: boolean;
  /**
   * When the edges may scroll the view. A drag that drop zones follow waits again when it leaves
   * the view, so coming back in across an edge doesn't scroll; see `EdgeArming`.
   */
  readonly edges: EdgeArming;
  /**
   * Where a moved event's copy follows the pointer outside the view, once a follower with `claims`
   * is on it.
   */
  floating?: Floating;
  /** Drop zones and watchers following a move (`monitorCalendarDrags`). */
  followers: readonly CalendarDragFollower[];
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
  /** What the preview shows, as the followers last heard it. */
  shown: CalendarDragPreview | null;
  /** Where a touch started, which keeps its `touchmove`s even after a re-render removes it. */
  readonly touchTarget: EventTarget | null;
  /** Rebuilt when the view renders new columns mid-gesture, as a scrolling view does. */
  surface: TargetSurface;
  /** Whether a follower stands for drop zones (it has `claims`), rather than only watching. */
  zones: boolean;
  /** The `columns` option `surface` was built from. */
  surfaceColumns: CalendarPointerOptions<TEvent, TEventId, TResourceId>["columns"];
}

const DEFAULT_SNAP: WallTimeSnapOptions = { increment: 15, smallestUnit: "minute" };
/** Pointer travel that turns a mouse or pen press into a drag; anything less is a click. */
const DRAG_DISTANCE = 4;
/**
 * Touch drags start after a still long-press, about as long as the platforms' own, so a swipe keeps
 * scrolling even when the finger rests a moment first.
 */
const LONG_PRESS_MS = 450;
const TOUCH_TOLERANCE = 8;
/** The most of a long or wide event the copy that follows the pointer outside the view shows. */
const FLOATING_MAXIMUM = { height: 120, width: 320 } as const;
const noFollowers: readonly CalendarDragFollower[] = Object.freeze([]);
const pointerInput: CalendarProposalDetail = Object.freeze({ input: "pointer" });

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

/** The size and press offset of the copy that follows a moved event outside the view. */
function floatingOf(element: HTMLElement, origin: CalendarPoint): Floating {
  const rect = element.getBoundingClientRect();
  const width = Math.min(rect.width, FLOATING_MAXIMUM.width);
  const height = Math.min(rect.height, FLOATING_MAXIMUM.height);
  const offset = {
    x: Math.min(Math.max(origin.x - rect.left, 0), width),
    y: Math.min(Math.max(origin.y - rect.top, 0), height),
  };
  return { height, offset, width };
}

/** Whether followers would hear nothing new: the same boxes, time range and policy answer. */
function samePreview(a: CalendarDragPreview | null, b: CalendarDragPreview | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.label === b.label &&
    a.validity === b.validity &&
    a.rects.length === b.rects.length &&
    a.rects.every(
      (rect, index) =>
        rect.x === b.rects[index]!.x &&
        rect.y === b.rects[index]!.y &&
        rect.width === b.rects[index]!.width &&
        rect.height === b.rects[index]!.height,
    )
  );
}

/** A preview segment's box, for followers. */
function viewportRect({ height, left, top, width }: GhostRect): CalendarRect {
  return { height, width, x: left, y: top };
}

/** Where the copy sits under the pointer, anywhere in the viewport. */
function floatingRect({ height, offset, width }: Floating, point: CalendarPoint): GhostRect {
  return {
    height,
    left: point.x - offset.x,
    top: point.y - offset.y,
    visible: { bottom: innerHeight, left: 0, right: innerWidth, top: 0 },
    width,
  };
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
 *   preview relabels with the proposed range;
 * - `data-occludes` on parts that sit over the cells, such as sticky headers: a gesture can't start
 *   or land on the cells scrolled beneath them;
 * - `data-calendar-pointer="none"` on controls of their own inside the region, such as annotation
 *   marks, so pressing them never starts a drag.
 *
 * The preview moves without re-rendering. `onPropose` runs once per drop; a click (less than a few
 * pixels of travel) is left alone, and Escape cancels. Touch drags start after a finger rests still
 * for 450 ms, so a swipe scrolls; once one starts, the page holds still under it. Returns a function
 * that detaches everything.
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
    detail: { readonly phase: "cancel" | "start" | "step" } | ProposalOutcome,
  ): void {
    const { check, gesture } = current;
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
      ...(detail.phase === "start" || detail.phase === "step" ? { check } : undefined),
      ...detail,
    } as CalendarInteractionUpdate);
  }

  /**
   * Follows the view's latest columns: a view that scrolls through days renders new ones while a
   * drag scrolls it, and their cells must map to times like the rest.
   */
  function refreshColumns(current: Session<TEvent, TEventId, TResourceId>): void {
    const { columns } = getOptions();
    if (columns === current.surfaceColumns) return;
    current.surfaceColumns = columns;
    current.surface = { ...current.surface, columns: columnsByDate(columns) };
  }

  /**
   * Whether the view is the topmost thing under the pointer: anything over it, such as a sheet
   * holding drop zones, hides it, as it does for drags in (`regionAt`).
   */
  function overView({ x, y }: CalendarPoint): boolean {
    const [top] = document.elementsFromPoint(x, y);
    return top !== undefined && region.contains(top);
  }

  /**
   * Off the view, or over a drop zone that claims it, a moved event that a follower with `claims`
   * follows shows as a copy under the pointer; elsewhere, such as over a header, nothing shows.
   */
  function showOutside(current: Session<TEvent, TEventId, TResourceId>): void {
    const { floating, gesture } = current;
    if (
      floating === undefined ||
      gesture.kind !== "move" ||
      (!current.claimed && overView(current.point))
    ) {
      current.ghost.clear();
      return;
    }
    current.ghost.render(
      [floatingRect(floating, current.point)],
      gesture.element,
      null,
      null,
      true,
    );
  }

  /** Shows where a drop would land; returns whether that changed. */
  function preview(current: Session<TEvent, TEventId, TResourceId>, scrolled = false): boolean {
    refreshColumns(current);
    current.claimed = claimed(current.followers);
    // A drag that drop zones follow lands only where the view is on top, so a release over a
    // sheet of zones above the calendar, between its zones, doesn't move the event beneath.
    const hidden = current.claimed || (current.zones && !overView(current.point));
    const target = hidden ? null : targetAt(current.surface, current.point.x, current.point.y);
    const placement = target === null ? null : placementAt(current, target);
    if (placement === null) {
      // Nothing to drop here, so show nothing rather than the last valid spot.
      const changed = current.placement !== null;
      current.placement = null;
      current.check = null;
      showOutside(current);
      if (changed) {
        getOptions().onPreview?.(null);
        show(current, () => null);
      }
      return changed;
    }
    const changed = current.placement === null || !samePlacement(current.placement, placement);
    if (!scrolled && !changed) return false;

    current.placement = placement;
    if (changed) {
      const proposed = proposal(current);
      current.check = proposed === null ? null : (getOptions().check?.(proposed) ?? null);
      getOptions().onPreview?.({
        eventId: current.gesture.kind === "create" ? null : current.gesture.event.id,
        proposed: placement,
      });
    }
    const { gesture } = current;
    const layout = ghostLayout(current.surface, placement, current.options.timeZone);
    const template = layout.axis === "time" && gesture.kind !== "create" ? gesture.element : null;
    const label =
      template === null
        ? null
        : (current.announcer?.formatRange(placement) ??
          formatPlacementRange(placement, { timeZone: current.options.timeZone }));
    const validity = ghostValidity(current.check);
    current.ghost.render(layout.rects, template, label, validity);
    show(current, () => ({ label, rects: layout.rects.map(viewportRect), validity }));
    return changed;
  }

  /** Tells the followers what the preview shows now. */
  function show(
    current: Session<TEvent, TEventId, TResourceId>,
    shown: () => CalendarDragPreview | null,
  ): void {
    // Creates, resizes and drags no one follows build nothing.
    if (current.followers.length === 0) return;
    const preview = shown();
    const same = samePreview(current.shown, preview);
    current.shown = preview;
    if (!same) tellFollowers(current.followers, (follower) => follower.preview?.(preview));
  }

  /**
   * A drag that drop zones follow scrolls the view only over it, and once back in, only after the
   * pointer has been clear of its edges or rested at one, so one on its way to a sidebar or back
   * from it leaves the view be.
   */
  function trackEdges(current: Session<TEvent, TEventId, TResourceId>): void {
    if (!current.zones) return;
    const { x, y } = current.point;
    if (!overView(current.point)) current.edges.disarm();
    else current.edges.update(current.scrollContainer, x, y, performance.now());
  }

  function scrollFrame(): void {
    const current = session;
    if (current === null) return;
    // Over a drop zone outside the calendar, the calendar holds still.
    trackEdges(current);
    const holds = current.claimed || !current.edges.armed;
    if (
      !holds &&
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
    if (current.gesture.kind === "move") follow(current, current.gesture);
    trackEdges(current);
    current.frame = requestAnimationFrame(scrollFrame);
    preview(current);
    announce(current, { phase: "start" });
  }

  /** Offers a move to the monitors, for drop zones outside the calendar and animations. */
  function follow(
    current: Session<TEvent, TEventId, TResourceId>,
    { element, event }: EventGesture<TEvent, TEventId, TResourceId>,
  ): void {
    const drag: CalendarEventDrag<TEvent, TEventId, TResourceId> = {
      element,
      event,
      origin: current.origin,
      refresh: () => {
        if (session === current && current.active && preview(current)) {
          announce(current, { phase: "step" });
        }
      },
    };
    current.followers = followersOf(drag as CalendarEventDrag);
    current.zones = current.followers.some((follower) => follower.claims !== undefined);
    if (current.zones) current.floating = floatingOf(element, current.origin);
    tellFollowers(current.followers, (follower) => follower.move?.(current.point));
  }

  /**
   * Ends the gesture; `dropped` tells its followers a drop zone of theirs took it, and `landing`
   * what the preview showed where a release in the view proposed the move.
   */
  function end(dropped = false, landing: CalendarDragPreview | null = null): void {
    const current = session;
    if (current === null) return;
    session = null;

    if (current.placement !== null) getOptions().onPreview?.(null);
    clearTimeout(current.longPress);
    if (current.frame !== undefined) cancelAnimationFrame(current.frame);
    current.ghost.clear();
    region.removeAttribute("data-interaction");
    if (current.gesture.kind !== "create") current.gesture.element.removeAttribute("data-dragging");

    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);
    window.removeEventListener("keydown", onKeyDown, true);
    current.touchTarget?.removeEventListener("touchmove", onTouchMove);
    for (const type of ["contextmenu", "dragstart", "selectstart"]) {
      window.removeEventListener(type, preventDefault);
    }
    tellFollowers(current.followers, (follower) => follower.end?.(dropped, landing));
  }

  /** Ends the gesture without proposing anything. */
  function cancel(): void {
    if (session?.active === true) announce(session, { phase: "cancel" });
    end();
  }

  /** Cancels when the browser takes over the gesture's own pointer, not another finger. */
  function onPointerCancel(event: PointerEvent): void {
    if (event.pointerId === session?.pointerId) cancel();
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
      tellFollowers(current.followers, (follower) => follower.move?.(current.point));
      trackEdges(current);
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
    tellFollowers(current.followers, (follower) => follower.move?.(current.point));
    // As if scrolled, so followers land on the preview's boxes as they are now, after a wheel
    // scroll that moved them less than a slot.
    preview(current, true);
    if (current.claimed) {
      // A drop zone outside the calendar took it: the zone's owner handles and announces it.
      end(true);
      suppressNextClick();
      return;
    }
    const proposed = proposal(current);
    end(false, proposed === null ? null : current.shown);
    suppressNextClick();
    if (proposed === null) {
      announce(current, { phase: "cancel" });
      return;
    }
    void settleProposal(
      getOptions().onPropose(proposed, pointerInput),
      current.placement!,
      (outcome) => announce(current, outcome),
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
    if (pressed.closest('[data-calendar-pointer="none"]') !== null) return null;
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
      columns: columnsByDate(options.columns),
      region,
    };
    const target = targetAt(surface, event.clientX, event.clientY);
    const gesture = target === null ? null : gestureFor(event.target, target, options.events);
    if (gesture === null) return;

    const current: Session<TEvent, TEventId, TResourceId> = {
      active: false,
      announcer: options.announcer,
      check: null,
      claimed: false,
      edges: new EdgeArming(true),
      followers: noFollowers,
      gesture,
      ghost: new GhostLayer(region, options.ghostClassName),
      options: { snap: options.snap ?? DEFAULT_SNAP, timeZone: options.timeZone },
      origin: { x: event.clientX, y: event.clientY },
      placement: null,
      point: { x: event.clientX, y: event.clientY },
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      scrollContainer: options.scrollContainer?.current ?? scrollableAncestor(event.target),
      shown: null,
      surface,
      surfaceColumns: options.columns,
      // The region listens already; adding its listener again would add nothing, and removing it
      // when the gesture ends would leave the region deaf.
      touchTarget: event.pointerType === "touch" && event.target !== region ? event.target : null,
      zones: false,
    };
    session = current;

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("keydown", onKeyDown, true);
    for (const type of ["contextmenu", "dragstart", "selectstart"]) {
      window.addEventListener(type, preventDefault);
    }
    if (event.pointerType === "touch") {
      // A scrolling view can drop the pressed element as a drag scrolls it; its touch moves still
      // go to it, off the page, where the region doesn't hear them.
      current.touchTarget?.addEventListener("touchmove", onTouchMove, { passive: false });
      current.longPress = setTimeout(() => activate(current), LONG_PRESS_MS);
    }
  }

  /**
   * Holds the page still under a drag that has started. The region listens from the start, not
   * from the long-press: Safari on iOS decides whether a touch can cancel scrolling when the touch
   * begins. A non-passive listener makes each touch on the region wait for the main thread before
   * it scrolls, so a region disabled when it's attached doesn't listen.
   */
  function onTouchMove(event: Event): void {
    if (session?.active === true) event.preventDefault();
  }

  region.addEventListener("pointerdown", onPointerDown);
  if (getOptions().disabled !== true) {
    region.addEventListener("touchmove", onTouchMove, { passive: false });
  }
  // Listed while attached, so items dragged in from outside the calendar find the view.
  const unregister = registerRegion({ element: region, getOptions } as unknown as PointerRegion);
  return () => {
    // A drag in progress is announced as cancelled, as when the view goes read-only mid-drag.
    cancel();
    region.removeEventListener("pointerdown", onPointerDown);
    region.removeEventListener("touchmove", onTouchMove);
    unregister();
  };
}
