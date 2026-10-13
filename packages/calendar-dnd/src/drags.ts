import type { EventId, NormalizedCalendarEvent, ResourceId } from "@moltenship/calendar-core";

/** A point in viewport (client) coordinates. */
export interface CalendarPoint {
  readonly x: number;
  readonly y: number;
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

/** Follows one drag that a monitor took on. */
export interface CalendarDragFollower {
  /**
   * Whether a drop zone of the follower's is under the pointer. While one is, the calendar shows
   * no preview of its own, and a release there proposes nothing and announces nothing: the zone's
   * owner handles the drop and speaks for it.
   */
  readonly claims?: () => boolean;
  /**
   * The drag ended. `dropped` is true when it was released while `claims` said so, false after a
   * drop in the calendar, a release over nowhere, Escape, or a lost pointer.
   */
  readonly end?: (dropped: boolean) => void;
  /** The pointer moved. */
  readonly move?: (point: CalendarPoint) => void;
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
 * outside the calendar can take it: a list of unscheduled items, a bin. Resizes and creates aren't
 * offered. While a follower is on a drag, the view counts only where it's the topmost thing under
 * the pointer, so a sheet of zones over it hides it; off the view, covered or claimed, a copy of
 * the event follows the pointer. The view scrolls only while the pointer is over it, and after the
 * pointer has left, only once it has been clear of the edges again. Returns a function that stops
 * listening.
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
