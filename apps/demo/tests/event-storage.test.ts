import { describe, expect, test } from "vite-plus/test";

import { formatRecurrenceRule } from "@moltenship/calendar-recurrence";

import type { DemoEvent } from "../src/calendar";
import { parseEvents, serializeEvents } from "../src/event-storage";
import { createSeedEvents } from "../src/seed";
import { createSeriesEvents } from "../src/seed-series";

const events = createSeedEvents(Temporal.PlainDate.from("2026-10-08"), "Europe/Berlin");
const series = createSeriesEvents(Temporal.PlainDate.from("2026-10-08"), "Europe/Berlin");

describe("event storage", () => {
  test("round-trips timed and all-day events through JSON", () => {
    const stored = serializeEvents(events);
    const parsed = parseEvents(stored);

    expect(parsed).not.toBeNull();
    expect(JSON.parse(serializeEvents(parsed ?? []))).toEqual(JSON.parse(stored));
    expect(parsed?.find(({ kind }) => kind === "timed")?.start).toBeInstanceOf(Temporal.Instant);
    expect(parsed?.find(({ kind }) => kind === "all-day")?.start).toBeInstanceOf(
      Temporal.PlainDate,
    );
    expect(parsed?.find(({ title }) => title === "Design review")?.resourceIds).toEqual([
      "room-orchid",
      "person-maya",
      "person-alex",
    ]);
  });

  test("round-trips series: rule text, exception and extra dates, and overrides", () => {
    const standup = series.find(({ id }) => id === "standup")!;
    const extras: DemoEvent = {
      ...standup,
      id: "extras",
      recurrence: {
        ...standup.recurrence,
        duration: Temporal.Duration.from({ minutes: 20 }),
        // A whole-day exception, an extra start and an extra period with its own length.
        exceptionDates: [Temporal.PlainDate.from("2026-12-24")],
        recurrenceDates: [
          Temporal.Instant.from("2026-10-17T08:00:00Z"),
          {
            end: Temporal.Instant.from("2026-10-18T09:00:00Z"),
            start: Temporal.Instant.from("2026-10-18T08:00:00Z"),
          },
        ],
        wallStart: Temporal.PlainDateTime.from("2025-10-06T09:30"),
      },
    };
    const stored = serializeEvents([...series, extras]);
    const parsed = parseEvents(stored);
    const json = JSON.parse(stored) as Record<string, unknown>[];

    expect(JSON.parse(serializeEvents(parsed ?? []))).toEqual(json);
    // Rules are stored as RRULE text, and series dates as recurrence keys.
    expect(json.find(({ id }) => id === "standup")?.recurrence).toEqual({
      exceptionDates: ["2026-10-14T07:30:00Z", "2026-10-15T07:30:00Z", "2026-10-16T07:30:00Z"],
      rule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
    });
    expect(json.find(({ id }) => id === "standup-moved")?.override).toEqual({
      recurrenceId: "2026-10-07T07:30:00Z",
      seriesId: "standup",
    });
    const read = parsed?.find(({ id }) => id === "extras")?.recurrence;
    expect(read?.exceptionDates?.[0]).toBeInstanceOf(Temporal.PlainDate);
    expect(read?.recurrenceDates?.[0]).toBeInstanceOf(Temporal.Instant);
    expect(read?.recurrenceDates?.[1]).toMatchObject({ end: expect.any(Temporal.Instant) });
    expect(read?.wallStart).toBeInstanceOf(Temporal.PlainDateTime);
    expect(read?.rule && formatRecurrenceRule(read.rule)).toBe("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR");
    expect(parsed?.find(({ id }) => id === "standup")).toMatchObject({
      sourceTimeZone: "Europe/Berlin",
    });
  });

  test("loads events saved before the demo had recurrence as one-off events", () => {
    // What the previous version stored: no recurrence, override or zone fields.
    const saved = JSON.stringify(
      JSON.parse(serializeEvents(events)).map(
        ({ recurrence: _r, override: _o, sourceTimeZone: _z, ...event }: Record<string, unknown>) =>
          event,
      ),
    );

    expect(parseEvents(saved)?.map(({ id }) => id)).toEqual(events.map(({ id }) => id));
  });

  test.each([
    ["nothing stored", null],
    ["malformed JSON", "{"],
    ["a non-array", '{"events":[]}'],
    [
      "an unknown calendar",
      JSON.stringify([{ ...JSON.parse(serializeEvents(events))[0], calendarId: "gone" }]),
    ],
    [
      "an unknown resource",
      JSON.stringify([{ ...JSON.parse(serializeEvents(events))[0], resourceIds: ["gone"] }]),
    ],
    [
      "an unparseable instant",
      JSON.stringify([{ ...JSON.parse(serializeEvents(events))[0], start: "soon" }]),
    ],
    [
      "a rule without FREQ",
      JSON.stringify([
        { ...JSON.parse(serializeEvents(events))[0], recurrence: { rule: "BYDAY=MO" } },
      ]),
    ],
    [
      "an unknown time zone",
      JSON.stringify([
        { ...JSON.parse(serializeEvents(events))[0], sourceTimeZone: "Mars/Olympus" },
      ]),
    ],
    [
      "an override without its series",
      JSON.stringify([
        { ...JSON.parse(serializeEvents(events))[0], override: { recurrenceId: "2026-10-08" } },
      ]),
    ],
  ])("falls back for %s", (_, stored) => {
    expect(parseEvents(stored)).toBeNull();
  });
});
