import { expect, test } from "vite-plus/test";

import type { DemoEvent } from "../src/calendar";
import { formatEventWhen } from "../src/event-format";

const base = { calendarId: "work", id: "e", title: "Event" } as const;
const instant = (value: string) => Temporal.Instant.from(value);
const date = (value: string) => Temporal.PlainDate.from(value);

test.each<[string, DemoEvent, string]>([
  [
    "a same-day timed event",
    {
      ...base,
      end: instant("2026-10-08T13:45:00Z"),
      kind: "timed",
      start: instant("2026-10-08T13:30:00Z"),
    },
    "Thursday, October 8 · 9:30 – 9:45 AM",
  ],
  [
    "an overnight timed event",
    {
      ...base,
      end: instant("2026-10-08T05:30:00Z"),
      kind: "timed",
      start: instant("2026-10-08T03:00:00Z"),
    },
    "Wednesday, October 7 at 11:00 PM – Thursday, October 8 at 1:30 AM",
  ],
  [
    "a one-day all-day event",
    { ...base, end: date("2026-10-11"), kind: "all-day", start: date("2026-10-10") },
    "Saturday, October 10",
  ],
  [
    "a multi-day all-day event",
    { ...base, end: date("2026-10-17"), kind: "all-day", start: date("2026-10-14") },
    "Wednesday, October 14 – Friday, October 16",
  ],
])("formats %s", (_, event, expected) => {
  // Intl separates times with thin and narrow no-break spaces.
  expect(formatEventWhen(event, "America/New_York", "en-US").replace(/\s/g, " ")).toBe(expected);
});
