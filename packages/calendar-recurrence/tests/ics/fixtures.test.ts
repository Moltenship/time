import { readFileSync } from "node:fs";

import { createCanonicalEventAdapter, createEventSnapshot } from "@moltenship/calendar-core";
import { parseIcs, type IcsCalendar, type IcsEvent } from "@moltenship/ics";
import { describe, expect, test } from "vite-plus/test";

import {
  createCanonicalRecurrenceAdapter,
  createOccurrenceAdapter,
  createOccurrenceExpander,
  occurrenceId,
  recurrenceKey,
  recurringEventsFromIcs,
  type RecurrenceOccurrence,
} from "../../src";

function readFixture(name: string): IcsCalendar {
  const url = new URL(`../../../ics/tests/fixtures/${name}`, import.meta.url);
  return parseIcs(readFileSync(url, "utf8")).calendars[0]!;
}

/** Parses a fixture, bridges it, expands it over `start` to `end` in Berlin and snapshots it. */
function expandFixture(name: string, start: string, end: string) {
  const calendar = readFixture(name);
  const bridged = recurringEventsFromIcs(calendar.events, { timeZone: calendar.timeZone });
  const expander = createOccurrenceExpander(createCanonicalRecurrenceAdapter<IcsEvent>());
  const expansion = expander.expand(bridged.events, {
    range: { end: Temporal.PlainDate.from(end), start: Temporal.PlainDate.from(start) },
    timeZone: "Europe/Berlin",
  });
  const snapshot = createEventSnapshot(
    expansion.occurrences,
    createOccurrenceAdapter(createCanonicalEventAdapter<IcsEvent>()),
  );
  return { bridged, expansion, snapshot };
}

type Occurrence = RecurrenceOccurrence<unknown>;

/**
 * A series' occurrences as their recurrence key and wall-clock start in `timeZone`, by original
 * start: overrides follow the input order of their own events.
 */
function occurrencesOf(occurrences: readonly Occurrence[], seriesId: string, timeZone: string) {
  return occurrences
    .filter((occurrence) => occurrence.recurrence?.seriesId === seriesId)
    .map(({ interval, recurrence }) => [
      recurrenceKey(recurrence!.recurrenceId),
      (interval.start as Temporal.Instant)
        .toZonedDateTimeISO(timeZone)
        .toPlainDateTime()
        .toString(),
    ])
    .sort(([left], [right]) => left!.localeCompare(right!));
}

describe("ICS fixtures, bridged and expanded", () => {
  test("expands Google's weekly series with its exceptions, override and cancellation", () => {
    const uid = "7kukuqrfedlm2f9t0vr42q2bfe@google.com";
    const { bridged, expansion, snapshot } = expandFixture(
      "google.ics",
      "2026-01-01",
      "2026-04-06",
    );

    expect(occurrencesOf(expansion.occurrences, uid, "Europe/Berlin")).toEqual([
      ["2026-01-12T09:00:00Z", "2026-01-12T10:00:00"],
      ["2026-01-19T09:00:00Z", "2026-01-19T10:00:00"],
      ["2026-02-02T09:00:00Z", "2026-02-02T10:00:00"],
      ["2026-02-09T09:00:00Z", "2026-02-09T14:00:00"],
      ["2026-02-23T09:00:00Z", "2026-02-23T10:00:00"],
      ["2026-03-09T09:00:00Z", "2026-03-09T10:00:00"],
      ["2026-03-16T09:00:00Z", "2026-03-16T10:00:00"],
      ["2026-03-23T09:00:00Z", "2026-03-23T10:00:00"],
      ["2026-03-30T08:00:00Z", "2026-03-30T10:00:00"],
    ]);
    const moved = expansion.occurrences.find(
      (occurrence) =>
        occurrence.id === occurrenceId(uid, Temporal.Instant.from("2026-02-09T09:00:00Z")),
    );
    expect(moved?.event.title).toBe("Weekly sync (moved)");
    expect(moved?.recurrence?.series?.title).toBe("Weekly sync");

    expect(
      expansion.occurrences
        .filter((occurrence) => occurrence.recurrence === undefined)
        .map(({ id, interval }) => [
          id,
          String(interval.start),
          String(interval.end),
          interval.kind === "timed" ? interval.sourceTimeZone : interval.kind,
        ]),
    ).toEqual([
      [
        "3h2k9f8s7d6a5g4j3k2l1m0n9b@google.com",
        "2026-01-20T11:30:00Z",
        "2026-01-20T12:30:00Z",
        "UTC",
      ],
      ["0p9o8i7u6y5t4r3e2w1q0a9s8d@google.com", "2026-04-15", "2026-04-18", "all-day"],
    ]);

    const cancelled = bridged.events.filter((event) => event.override?.cancelled === true);
    expect(cancelled.map((event) => event.id)).toEqual([
      occurrenceId(uid, Temporal.Instant.from("2026-03-02T09:00:00Z")),
    ]);
    const weekly = bridged.events.find((event) => event.id === uid && event.override === undefined);
    expect(bridged.issues.filter((issue) => issue.event.uid === uid)).toEqual([]);
    expect(expansion.issues.filter((issue) => issue.event.data.uid === uid)).toEqual([]);
    expect(String(weekly?.recurrence?.rule?.until)).toBe("2026-03-30T21:59:59Z");
    expect(snapshot.issues.map((issue) => issue.code)).not.toContain("duplicate-event-id");
  });

  test("expands Outlook's Tuesday and Thursday series in its Windows time zone", () => {
    const { bridged, expansion, snapshot } = expandFixture(
      "outlook.ics",
      "2026-03-01",
      "2026-04-01",
    );
    const standUp = bridged.events.find((event) => event.title === "Stand-up (Seattle)")!;
    expect(standUp).toMatchObject({ kind: "timed", sourceTimeZone: "America/Los_Angeles" });
    expect(standUp.recurrence?.rule).toMatchObject({ count: 6, weekStart: "SU" });

    expect(occurrencesOf(expansion.occurrences, standUp.id, "America/Los_Angeles")).toEqual([
      ["2026-03-10T16:00:00Z", "2026-03-10T09:00:00"],
      ["2026-03-12T16:00:00Z", "2026-03-12T09:00:00"],
      ["2026-03-24T16:00:00Z", "2026-03-24T09:00:00"],
      ["2026-03-26T16:00:00Z", "2026-03-26T09:00:00"],
    ]);
    expect(bridged.issues).toEqual([]);
    expect(expansion.issues).toEqual([]);
    expect(snapshot.issues.map((issue) => issue.code)).not.toContain("duplicate-event-id");
  });
});
