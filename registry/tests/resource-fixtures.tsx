import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEvent,
  type CalendarResource,
} from "@moltenship/calendar";

import { createResourceColumnsView } from "../resource-columns-view/resource-columns-view";

export type StaffEvent = CalendarEvent<null, string, string>;

export function shift(id: string, resourceIds: readonly string[], start: string, end: string) {
  return {
    data: null,
    end: Temporal.Instant.from(end),
    id,
    kind: "timed",
    resourceIds,
    start: Temporal.Instant.from(start),
    title: id,
  } as const satisfies StaffEvent;
}

export function shiftAllDay(
  id: string,
  resourceIds: readonly string[],
  start: string,
  end: string,
) {
  return {
    data: null,
    end: Temporal.PlainDate.from(end),
    id,
    kind: "all-day",
    resourceIds,
    start: Temporal.PlainDate.from(start),
    title: id,
  } as const satisfies StaffEvent;
}

/** `count` people, named "Person 1" onwards. */
export function people(count: number): CalendarResource<null>[] {
  return Array.from({ length: count }, (_, index) => ({
    data: null,
    id: `p${index + 1}`,
    title: `Person ${index + 1}`,
  }));
}

export const ResourceCalendar = createCalendar<StaffEvent, CalendarResource<null>>()({
  eventAdapter: createCanonicalEventAdapter<null, string, string>(),
  views: [createResourceColumnsView<StaffEvent>({ unassigned: "bucket" })],
});

/** The same resources over a week: seven day columns each. */
export const ResourceWeekCalendar = createCalendar<StaffEvent, CalendarResource<null>>()({
  eventAdapter: createCanonicalEventAdapter<null, string, string>(),
  views: [createResourceColumnsView<StaffEvent>({}, 7)],
});
