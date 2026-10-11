import type { DemoEvent } from "./calendar";
import type { DemoResourceId } from "./resources";

/** Meetings around the moment the demo opens, by minutes from it, so resources show as busy. */
const meetings: readonly {
  readonly from: number;
  readonly minutes: number;
  readonly resourceIds: readonly DemoResourceId[];
  readonly title: string;
}[] = [
  { from: -30, minutes: 90, resourceIds: ["room-orchid", "person-maya"], title: "Client workshop" },
  {
    from: -15,
    minutes: 60,
    resourceIds: ["person-sam", "person-jordan"],
    title: "Pairing session",
  },
  { from: 30, minutes: 60, resourceIds: ["person-sam"], title: "Incident review" },
  { from: 75, minutes: 45, resourceIds: ["room-lotus", "person-alex"], title: "Candidate chat" },
];

/**
 * Read-only meetings in progress now, or starting soon, for the status badges in the resource
 * views. They are made fresh on each visit rather than stored, so they stay around the present.
 */
export function busyNowEvents(now: Temporal.Instant, timeZone: string): DemoEvent[] {
  const start = now
    .toZonedDateTimeISO(timeZone)
    .round({ roundingIncrement: 15, roundingMode: "floor", smallestUnit: "minute" });
  return meetings.map(({ from, minutes, resourceIds, title }, index) => ({
    calendarId: "work",
    end: start.add({ minutes: from + minutes }).toInstant(),
    id: `busy-now-${index + 1}`,
    kind: "timed",
    live: true,
    resourceIds,
    start: start.add({ minutes: from }).toInstant(),
    title,
  }));
}
