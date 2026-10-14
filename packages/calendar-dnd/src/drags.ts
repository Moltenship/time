import type { EventId, NormalizedCalendarEvent, ResourceId } from "@moltenship/calendar-core";

/** A point in viewport (client) coordinates. */
export interface CalendarPoint {
  readonly x: number;
  readonly y: number;
}

/** A rectangle in viewport (client) coordinates. */
export interface CalendarRect {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

/** Where a view's preview shows that a moved event would land. */
export interface CalendarDragPreview {
  /**
   * The time range the preview's copy of the event shows, as the view's announcer formats it, or
   * `null` where the preview is a plain box, as in a month.
   */
  readonly label: string | null;
  /**
   * The preview's boxes at least partly in view, in order, each at its full size even where a
   * scroller clips it: a day, week row or resource the event would cover. Empty when none is.
   */
  readonly rects: readonly CalendarRect[];
  /** `invalid` when a policy would reject the drop, `warning` when one would flag it. */
  readonly validity: "invalid" | "warning" | null;
}

/** An event the pointer layer is moving, offered to `monitorCalendarDrags`. */
export interface CalendarEventDrag<
  TEvent = unknown,
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
> {
  /** The element pressed: the event's segment in the view. */
  readonly element: HTMLElement;
  /** The event, as the view rendered it; `event.event` is the application's record. */
  readonly event: NormalizedCalendarEvent<TEvent, TEventId, TResourceId>;
  /** Where the press was. */
  readonly origin: CalendarPoint;
  /**
   * Asks `claims` again and redraws the preview, for a follower whose answer changed without the
   * pointer moving, as when a library works out its drop target after a move.
   */
  readonly refresh: () => void;
}

/**
 * Follows one drag that a monitor took on. A follower with `claims` stands for drop zones outside
 * the calendar, which changes how the view treats the drag; one without only watches it, as an
 * animation that decorates drags does, and the drag goes on as if no one followed.
 */
export interface CalendarDragFollower {
  /**
   * Whether a drop zone of the follower's is under the pointer. While one is, the calendar shows
   * no preview of its own, and a release there proposes nothing and announces nothing: the zone's
   * owner handles the drop and speaks for it.
   */
  readonly claims?: () => boolean;
  /**
   * The drag ended. `dropped` is true when it was released while `claims` said so, false after a
   * drop in the calendar, a release over nowhere, Escape, or a lost pointer. `landing` is the
   * preview a release in the view proposed the move at, policies still to run; `null` when it
   * proposed nothing: Escape, a lost pointer, or a release where the event already was, over
   * nowhere or over a zone. No `preview(null)` comes before it.
   */
  readonly end?: (dropped: boolean, landing: CalendarDragPreview | null) => void;
  /** The pointer moved. */
  readonly move?: (point: CalendarPoint) => void;
  /**
   * The view's preview changed, or moved as the view scrolled under it: where a drop would land
   * now, or `null` when the view shows none, off it or under a claimed zone.
   */
  readonly preview?: (preview: CalendarDragPreview | null) => void;
}

/** Hears a move as it starts; returns a follower to take it on, or nothing to leave it. */
export type CalendarDragMonitor = (drag: CalendarEventDrag) => CalendarDragFollower | void;

const monitors = new Set<CalendarDragMonitor>();

/** Reports an application callback's error without breaking the gesture it heard about. */
export function reportCallbackError(error: unknown): void {
  if (typeof reportError === "function") reportError(error);
  else console.error(error);
}

/**
 * Hears every event a calendar view starts to move by pointer, on the page, so a drop zone
 * outside the calendar can take it, such as a list of unscheduled items or a bin, or an animation
 * can follow it. Resizes and creates aren't offered. While a follower with `claims` is on a drag,
 * the view counts only where it's the topmost thing under the pointer, so a sheet of zones over it
 * hides it; off the view, covered or claimed, a copy of the event follows the pointer. The view
 * scrolls only while the pointer is over it, and after the pointer has left, only once it has
 * been clear of the edges again or rested at one. Followers without `claims` change none of that.
 * Returns a function that stops listening.
 */
export function monitorCalendarDrags(monitor: CalendarDragMonitor): () => void {
  monitors.add(monitor);
  return () => {
    monitors.delete(monitor);
  };
}

/** The followers the monitors put on a drag that just started. */
export function followersOf(drag: CalendarEventDrag): CalendarDragFollower[] {
  const followers: CalendarDragFollower[] = [];
  for (const monitor of monitors) {
    try {
      const follower = monitor(drag);
      if (follower) followers.push(follower);
    } catch (error) {
      reportCallbackError(error);
    }
  }
  return followers;
}

/** Calls `notify` on each follower, reporting what throws instead of stopping the gesture. */
export function tellFollowers(
  followers: readonly CalendarDragFollower[],
  notify: (follower: CalendarDragFollower) => void,
): void {
  for (const follower of followers) {
    try {
      notify(follower);
    } catch (error) {
      reportCallbackError(error);
    }
  }
}

/** Whether a follower claims the point now. */
export function claimed(followers: readonly CalendarDragFollower[]): boolean {
  return followers.some((follower) => {
    try {
      return follower.claims?.() === true;
    } catch (error) {
      reportCallbackError(error);
      return false;
    }
  });
}
