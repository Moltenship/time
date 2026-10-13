import {
  eventPlacement,
  type CalendarEventPlacement,
  type CalendarEventProposal,
  type CalendarInteractionCheck,
  type CalendarInteractionUpdate,
  type CalendarProposalDetail,
  type CalendarTransactionResult,
  type EventId,
  type NormalizedCalendarEvent,
  type ResourceId,
} from "@moltenship/calendar-core";
import type { WallTimeSnapOptions } from "@moltenship/calendar-temporal";

import { autoScroll, clearOfEdges, scrollableAncestor } from "./auto-scroll";
import type { CalendarPoint } from "./drags";
import { droppedPlacement, samePlacement, type DroppedItem, type GestureOptions } from "./gestures";
import { ghostLayout, GhostLayer, ghostValidity } from "./ghost";
import { settleProposal, type ProposalOutcome } from "./outcome";
import { regionAt, takesDrops, type PointerRegion } from "./regions";
import { columnsByDate, targetAt, type TargetSurface } from "./targets";

/** What an item dragged in from outside the calendar becomes when it's dropped on a view. */
export interface CalendarDropSource<TEvent = unknown, TEventId extends EventId = EventId> {
  /** How many days it covers when dropped on day cells: a month cell, the all-day row. 1 by default. */
  readonly days?: number;
  /** How long it is when dropped on a time column. An hour by default. */
  readonly duration?: Temporal.Duration | Temporal.DurationLike;
  /**
   * The application record the new event copies, such as a task mapped to your event type. The
   * create change carries it as `change.event`, so `onEventChange` knows what was dropped.
   */
  readonly event?: TEvent;
  /**
   * An event the calendar shows, to move instead of creating one: its start lands where it's
   * dropped. A view without it takes no drop.
   */
  readonly eventId?: TEventId;
  /** What announcements call the item, such as a task's title. */
  readonly title?: string;
}

/** How `startCalendarDrop` follows a drag. */
export interface CalendarDropOptions {
  /**
   * The input driving the drag: `"keyboard"` for a drag library's keyboard sensor, `"pointer"`
   * (the default) for a mouse, finger or pen. Proposals and announcements carry it.
   */
  readonly input?: "keyboard" | "pointer";
}

/** A drag from outside the calendar, as `startCalendarDrop` follows it. */
export interface CalendarDropSession<
  TEvent = unknown,
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
> {
  /** Ends it without proposing anything, and announces a cancel if a view heard it start. */
  readonly cancel: () => void;
  /**
   * Proposes the placement under the last point, once, through the view's `onPropose`, and ends
   * the drag. Resolves with the transaction's result; `null` when it proposed nothing, over no
   * view or for a move that would change nothing, and when `onPropose` returns no result.
   */
  readonly drop: () => Promise<CalendarTransactionResult<TEvent, TEventId, TResourceId> | null>;
  /**
   * Follows the drag to a viewport point: finds the view under it, previews the placement a drop
   * there would make, checks it against the root's policies, announces it, and scrolls the view
   * near its edges. `null` means the point is over no calendar, as when the library has found a
   * drop zone of the app's there.
   */
  readonly move: (point: CalendarPoint | null) => void;
  /** Where a drop would land now; `null` over no view, and once the drag has ended. */
  readonly placement: CalendarEventPlacement<TResourceId> | null;
}

/** The event a drag by `eventId` moves, as a view has it. */
interface Moved {
  readonly event: NormalizedCalendarEvent<unknown, EventId, ResourceId>;
  readonly original: CalendarEventPlacement;
}

/** A region the drag is over, with what the drag worked out for it. */
interface Over {
  /**
   * Whether the point has been inside the scroll container clear of its edges since it came
   * over the region. Only then do the edges scroll it, so crossing one on the way in doesn't.
   */
  armed: boolean;
  readonly ghost: GhostLayer;
  /**
   * For a move, the event as this view has it, or `null` when the view lacks it or it's
   * read-only, which leaves nothing to drop; `undefined` for a create.
   */
  readonly moved: Moved | null | undefined;
  readonly options: GestureOptions;
  readonly region: PointerRegion;
  readonly scrollContainer: Element;
  surface: TargetSurface;
  surfaceColumns: readonly unknown[] | undefined;
}

/** A region whose announcer heard the drag start, and the event it heard about. */
interface Heard {
  readonly moved: Moved | null | undefined;
  readonly region: PointerRegion;
}

const DEFAULT_DURATION: Temporal.DurationLike = { hours: 1 };
const DEFAULT_SNAP: WallTimeSnapOptions = { increment: 15, smallestUnit: "minute" };

function regionOver(region: PointerRegion, hit: Element, eventId: EventId | undefined): Over {
  const options = region.getOptions();
  const event = eventId === undefined ? undefined : options.events.get(eventId);
  return {
    armed: false,
    ghost: new GhostLayer(region.element, options.ghostClassName),
    moved:
      eventId === undefined
        ? undefined
        : event === undefined || event.isReadOnly
          ? null
          : { event, original: eventPlacement(event) },
    options: { snap: options.snap ?? DEFAULT_SNAP, timeZone: options.timeZone },
    region,
    scrollContainer: options.scrollContainer?.current ?? scrollableAncestor(hit),
    surface: {
      clippers: new Map(),
      columns: columnsByDate(options.columns),
      region: region.element,
    },
    surfaceColumns: options.columns,
  };
}

/**
 * Follows a drag that started outside the calendar, such as a task dragged from a list, over the
 * calendar views on the page, and drops it into one: the framework-agnostic half of external drag
 * and drop, which a drag library's binding drives. Every view that uses `useCalendarPointer` takes
 * part, through the options it passes: the preview shows range boxes in its slots, its `check`
 * marks them `data-invalid` or `data-warning`, its announcer speaks each step with `outside` set,
 * and its `onPropose` gets the drop. Read-only views take no part.
 *
 * Over a time column a drop creates a timed event starting at the slot under the point,
 * `duration` long; over day cells, an all-day event of `days` days. In a resource view it books
 * the resource it's dropped in. With `eventId`, it moves that event instead, unless it's
 * read-only.
 *
 * The topmost element under the point decides: anything over a view, such as a sheet or a
 * dialog, hides it. So the library's drag image must let the pointer through
 * (`pointer-events: none`), as dnd-kit's does. From the first `move` until `drop` or `cancel`, a
 * frame loop scrolls the view under the point near its edges.
 */
export function startCalendarDrop<
  TEvent = unknown,
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
>(
  source: CalendarDropSource<TEvent, TEventId>,
  { input = "pointer" }: CalendarDropOptions = {},
): CalendarDropSession<TEvent, TEventId, TResourceId> {
  const duration = Temporal.Duration.from(source.duration ?? DEFAULT_DURATION);
  if (duration.sign <= 0) throw new RangeError("calendar-drop-duration-must-be-positive");
  const days = source.days ?? 1;
  if (!Number.isInteger(days) || days < 1) {
    throw new RangeError("calendar-drop-days-must-be-a-positive-integer");
  }
  const detail: CalendarProposalDetail = Object.freeze({ input });
  // One object for the whole drag, so messages can tell its steps from another drag's.
  const outside = Object.freeze(source.title === undefined ? {} : { title: source.title });

  let over: Over | null = null;
  let heard: Heard | null = null;
  let point: CalendarPoint | null = null;
  let placement: CalendarEventPlacement<TResourceId> | null = null;
  let check: CalendarInteractionCheck = null;
  let frame: number | undefined;
  let ended = false;

  function item(current: Over): DroppedItem<TResourceId> | null {
    if (current.moved === undefined) return { days, duration, kind: "create" };
    return current.moved === null
      ? null
      : {
          kind: "move",
          original: current.moved.original as CalendarEventPlacement<TResourceId>,
        };
  }

  function proposal(current: Over): CalendarEventProposal<TEventId, TResourceId, TEvent> | null {
    if (placement === null) return null;
    if (current.moved === undefined) {
      return {
        cause: "create",
        proposed: placement,
        ...(source.event === undefined ? {} : { event: source.event }),
      };
    }
    if (current.moved === null || samePlacement(placement, current.moved.original)) return null;
    return { cause: "move", eventId: source.eventId!, proposed: placement };
  }

  function announce(
    to: Heard,
    phase: { readonly phase: "cancel" | "start" | "step" } | ProposalOutcome,
    proposed: CalendarEventPlacement | null = placement,
  ): void {
    const { announcer } = to.region.getOptions();
    announcer?.announce({
      cause: to.moved === undefined ? "create" : "move",
      event: to.moved?.event ?? null,
      input,
      original: to.moved?.original ?? null,
      outside,
      proposed,
      ...(phase.phase === "start" || phase.phase === "step" ? { check } : undefined),
      ...phase,
    } as CalendarInteractionUpdate);
  }

  /** Clears what the drag shows in the region it leaves. */
  function leave(): void {
    if (over === null) return;
    if (placement !== null) over.region.getOptions().onPreview?.(null);
    over.ghost.clear();
    over = null;
  }

  /** Follows the view's latest columns, as a view that renders more days as it scrolls has. */
  function refreshColumns(current: Over): void {
    const { columns } = current.region.getOptions();
    if (columns === current.surfaceColumns) return;
    current.surfaceColumns = columns;
    current.surface = { ...current.surface, columns: columnsByDate(columns) };
  }

  /** Previews the drop under the point; `scrolled` redraws it after the view scrolled. */
  function update(scrolled = false): void {
    const hit = point === null ? null : regionAt(point.x, point.y);
    if (hit?.region !== over?.region) {
      const previous = placement;
      leave();
      placement = null;
      check = null;
      if (hit !== null) over = regionOver(hit.region, hit.element, source.eventId);
      // Leaving a view tells its announcer there's nowhere to drop now, as an in-view drag does.
      if (previous !== null && heard !== null) announce(heard, { phase: "step" }, null);
    }
    const current = over;
    if (current === null || point === null) return;

    refreshColumns(current);
    const target = targetAt(current.surface, point.x, point.y);
    const dropped = target === null ? null : item(current);
    const next =
      target === null || dropped === null
        ? null
        : droppedPlacement(dropped, target, current.options);
    const changed =
      next === null ? placement !== null : placement === null || !samePlacement(placement, next);
    // A scroll redraws the preview's boxes where they moved to; with no preview, there's none.
    if (!changed && (!scrolled || next === null)) return;

    const options = current.region.getOptions();
    placement = next;
    if (next === null) {
      check = null;
      current.ghost.clear();
      options.onPreview?.(null);
    } else {
      if (changed) {
        const proposed = proposal(current);
        check = proposed === null ? null : (options.check?.(proposed as never) ?? null);
        options.onPreview?.({ eventId: source.eventId ?? null, proposed: next });
      }
      const layout = ghostLayout(current.surface, next, current.options.timeZone);
      current.ghost.render(layout.rects, null, null, ghostValidity(check));
    }
    if (!changed) return;
    if (next !== null && heard?.region !== current.region) {
      heard = { moved: current.moved, region: current.region };
      announce(heard, { phase: "start" });
    } else if (heard !== null) {
      announce(heard, { phase: "step" }, heard.region === current.region ? next : null);
    }
  }

  /** Arms the view's auto-scroll once the point has been clear of its edges. */
  function arm(): void {
    if (over === null || point === null || over.armed) return;
    over.armed = clearOfEdges(over.scrollContainer, point.x, point.y);
  }

  function scrollFrame(): void {
    frame = undefined;
    if (ended) return;
    // A view that went read-only or away since the last move lets go of the drag.
    if (over !== null && !takesDrops(over.region)) update();
    // Only over a view, once the point has been clear of its edges: a drag still in a sidebar,
    // or one crossing an edge on its way in, leaves the calendar where it is.
    arm();
    if (over?.armed === true && point !== null) {
      if (autoScroll(over.scrollContainer, point.x, point.y)) update(true);
    }
    frame = requestAnimationFrame(scrollFrame);
  }

  /** Stops the drag; returns the region it was over. */
  function end(): Over | null {
    const last = over;
    ended = true;
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    leave();
    placement = null;
    return last;
  }

  return {
    cancel() {
      if (ended) return;
      end();
      if (heard !== null) announce(heard, { phase: "cancel" });
    },
    drop() {
      if (ended) return Promise.resolve(null);
      const landed = placement;
      const target = over !== null && takesDrops(over.region) ? over : null;
      const proposed = target === null ? null : proposal(target);
      end();
      if (target === null || proposed === null || landed === null) {
        if (heard !== null) announce(heard, { phase: "cancel" }, null);
        return Promise.resolve(null);
      }
      const { onPropose } = target.region.getOptions();
      // The view that heard the drag start: any change of view clears the placement, so a drop
      // with one lands where it started, and keeps the `original` its steps had.
      const to = heard ?? { moved: target.moved, region: target.region };
      return settleProposal<TEvent, TEventId, TResourceId>(
        onPropose(proposed as never, detail) as never,
        landed,
        (outcome) => announce(to, outcome, landed),
      );
    },
    move(next) {
      if (ended) return;
      point = next;
      update();
      arm();
      frame ??= requestAnimationFrame(scrollFrame);
    },
    get placement() {
      return placement;
    },
  };
}
