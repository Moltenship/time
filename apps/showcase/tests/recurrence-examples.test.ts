import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { weekRange } from "@moltenship/calendar";
import {
  createCanonicalRecurrenceAdapter,
  createOccurrenceExpander,
  type RecurrenceOccurrence,
} from "@moltenship/calendar-recurrence";
import type { IcsEvent } from "@moltenship/ics";
import { describe, expect, test } from "vite-plus/test";

import { createRecurringPreviewEvents } from "../components/recurrence-preview/events";
import { adapters as teamAdapters } from "../content/examples/recurrence-calendar";
import { adapters as meetingAdapters, type Meeting } from "../content/examples/recurring-meetings";
import { readRecurringFeed } from "../content/examples/recurring-feed";

/** Each occurrence as its ID, and its start on the wall clock of `timeZone`. */
function shown(occurrences: readonly RecurrenceOccurrence<unknown, string>[], timeZone: string) {
  return occurrences.map(({ id, interval }) => [
    id,
    interval.kind === "timed"
      ? interval.start.toZonedDateTimeISO(timeZone).toPlainDateTime().toString()
      : interval.start.toString(),
  ]);
}

describe("the preview's series", () => {
  const now = Temporal.ZonedDateTime.from("2026-10-14T15:20[Asia/Tokyo]");

  test("land around the visitor's week and current hour", () => {
    const expander = createOccurrenceExpander(teamAdapters);
    const range = weekRange(now.toPlainDate(), { weekStartsOn: 1 });
    const { issues, occurrences } = expander.expand(createRecurringPreviewEvents(now), {
      range,
      timeZone: now.timeZoneId,
    });
    expect(issues).toEqual([]);
    expect(shown(occurrences, now.timeZoneId)).toEqual([
      ["standup::2026-10-12T05:00:00Z", "2026-10-12T14:00:00"],
      ["standup::2026-10-13T05:00:00Z", "2026-10-13T14:00:00"],
      ["standup::2026-10-16T05:00:00Z", "2026-10-16T14:00:00"],
      // Wednesday's is skipped, and Thursday's moved an hour later.
      ["standup::2026-10-15T05:00:00Z", "2026-10-15T15:00:00"],
      ["one-on-one::2026-10-13T07:00:00Z", "2026-10-13T16:00:00"],
      ["planning::2026-10-12T07:00:00Z", "2026-10-12T16:00:00"],
      ["offsite-prep", "2026-10-14T16:30:00"],
      ["release-day::2026-10-16", "2026-10-16"],
    ]);
  });

  test.each([
    ["early on Monday", "2026-10-12T00:30[Europe/Berlin]"],
    ["late on Sunday", "2026-10-18T23:00[America/Los_Angeles]"],
  ])("keep every timed occurrence within its day, %s", (_, at) => {
    const now = Temporal.ZonedDateTime.from(at);
    const expander = createOccurrenceExpander(teamAdapters);
    const { occurrences } = expander.expand(createRecurringPreviewEvents(now), {
      range: weekRange(now.toPlainDate(), { weekStartsOn: 1 }),
      timeZone: now.timeZoneId,
    });
    expect(occurrences.length).toBe(8);
    for (const { interval } of occurrences) {
      if (interval.kind !== "timed") continue;
      const day = (instant: Temporal.Instant) =>
        instant.toZonedDateTimeISO(now.timeZoneId).toPlainDate().toString();
      expect(day(interval.start)).toBe(day(interval.end.subtract({ nanoseconds: 1 })));
    }
  });
});

describe("an application's own event type", () => {
  const berlin = "Europe/Berlin";
  const at = (wall: string) =>
    Temporal.PlainDateTime.from(wall).toZonedDateTime(berlin).toInstant();
  const meetings: Meeting[] = [
    {
      end: at("2026-10-19T09:30"),
      id: "sync",
      repeats: "FREQ=WEEKLY;BYDAY=MO,WE",
      skips: [at("2026-10-21T09:00")],
      start: at("2026-10-19T09:00"),
      timeZone: berlin,
      title: "Sync",
    },
    {
      end: at("2026-10-26T11:30"),
      id: "sync-late",
      replaces: { seriesId: "sync", start: at("2026-10-26T09:00") },
      start: at("2026-10-26T11:00"),
      timeZone: berlin,
      title: "Sync (late)",
    },
  ];

  test("expands through its adapters, at the same wall time across DST", () => {
    const { issues, occurrences } = createOccurrenceExpander(meetingAdapters).expand(meetings, {
      range: {
        end: Temporal.PlainDate.from("2026-11-02"),
        start: Temporal.PlainDate.from("2026-10-19"),
      },
      timeZone: berlin,
    });
    expect(issues).toEqual([]);
    expect(shown(occurrences, berlin)).toEqual([
      ["sync::2026-10-19T07:00:00Z", "2026-10-19T09:00:00"],
      ["sync::2026-10-28T08:00:00Z", "2026-10-28T09:00:00"],
      ["sync::2026-10-26T08:00:00Z", "2026-10-26T11:00:00"],
    ]);
  });
});

describe("readRecurringFeed", () => {
  const feed = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Moltenship//Tests//EN",
    "X-WR-TIMEZONE:Europe/Berlin",
    "BEGIN:VEVENT",
    "UID:standup@example.com",
    "DTSTAMP:20261001T080000Z",
    "DTSTART;TZID=Europe/Berlin:20261019T090000",
    "DTEND;TZID=Europe/Berlin:20261019T091500",
    "RRULE:FREQ=DAILY;COUNT=5",
    "EXDATE;TZID=Europe/Berlin:20261021T090000",
    "SUMMARY:Stand-up",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:standup@example.com",
    "DTSTAMP:20261001T080000Z",
    "RECURRENCE-ID;TZID=Europe/Berlin:20261020T090000",
    "DTSTART;TZID=Europe/Berlin:20261020T100000",
    "DTEND;TZID=Europe/Berlin:20261020T101500",
    "SUMMARY:Stand-up (moved)",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:standup@example.com",
    "DTSTAMP:20261001T080000Z",
    "RECURRENCE-ID;TZID=Europe/Berlin:20261022T090000",
    "DTSTART;TZID=Europe/Berlin:20261022T090000",
    "STATUS:CANCELLED",
    "SUMMARY:Stand-up",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  test("groups a feed into series the expander shows", () => {
    const events = readRecurringFeed(feed);
    const expander = createOccurrenceExpander(createCanonicalRecurrenceAdapter<IcsEvent>());
    const { issues, occurrences } = expander.expand(events, {
      range: {
        end: Temporal.PlainDate.from("2026-10-26"),
        start: Temporal.PlainDate.from("2026-10-19"),
      },
      timeZone: "Europe/Berlin",
    });
    expect(issues).toEqual([]);
    expect(shown(occurrences, "Europe/Berlin")).toEqual([
      ["standup@example.com::2026-10-19T07:00:00Z", "2026-10-19T09:00:00"],
      ["standup@example.com::2026-10-23T07:00:00Z", "2026-10-23T09:00:00"],
      ["standup@example.com::2026-10-20T07:00:00Z", "2026-10-20T10:00:00"],
    ]);
  });
});

describe("the API reference", () => {
  test("names every export of @moltenship/calendar-recurrence", async () => {
    const index = await readFile(
      fileURLToPath(new URL("../../../packages/calendar-recurrence/src/index.ts", import.meta.url)),
      "utf8",
    );
    const page = await readFile(
      fileURLToPath(new URL("../content/docs/api/recurrence.mdx", import.meta.url)),
      "utf8",
    );
    const names = [...index.matchAll(/export (?:type )?\{([^}]*)\}/g)].flatMap((match) =>
      match[1]!
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name !== ""),
    );
    expect(names.length).toBeGreaterThan(60);
    expect(names.filter((name) => !page.includes(`\`${name}`))).toEqual([]);
  });
});
