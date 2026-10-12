import { readFileSync } from "node:fs";

import { createCanonicalEventAdapter, createEventSnapshot } from "@moltenship/calendar-core";
import { parseIcs, type IcsEvent } from "@moltenship/ics";
import { describe, expect, test } from "vite-plus/test";

import {
  createCanonicalRecurrenceAdapter,
  createOccurrenceAdapter,
  createOccurrenceExpander,
  recurrenceKey,
  recurringEventsFromIcs,
  type IcsRecurringEventsOptions,
  type RecurrenceDate,
} from "../../src";

// Hand-written exports in the shapes Google Calendar, Outlook and iCloud write, run through the
// whole pipeline: parseIcs, the ICS bridge, the expander, and core's snapshot. Every expected
// value was worked out from RFC 5545 and the zones' 2026 DST dates: Europe on 29 March and
// 25 October, the US on 8 March and 1 November, Sydney on 5 April and 4 October.

function readCalendar(name: string) {
  const url = new URL(`./fixtures/${name}`, import.meta.url);
  const result = parseIcs(readFileSync(url, "utf8"));
  return { calendar: result.calendars[0]!, parseIssues: result.issues };
}

/**
 * Parses a fixture, bridges it in its X-WR-TIMEZONE, expands it over `start` to `end` for a
 * calendar shown in `timeZone`, and snapshots the occurrences as the calendar would.
 */
function expandFixture(
  name: string,
  start: string,
  end: string,
  timeZone: string,
  options: IcsRecurringEventsOptions = {},
) {
  const { calendar, parseIssues } = readCalendar(name);
  const bridged = recurringEventsFromIcs(calendar.events, {
    ...(calendar.timeZone === undefined ? {} : { timeZone: calendar.timeZone }),
    ...options,
  });
  const expander = createOccurrenceExpander(createCanonicalRecurrenceAdapter<IcsEvent>());
  const expansion = expander.expand(bridged.events, {
    range: { end: Temporal.PlainDate.from(end), start: Temporal.PlainDate.from(start) },
    timeZone,
  });
  const snapshot = createEventSnapshot(
    expansion.occurrences,
    createOccurrenceAdapter(createCanonicalEventAdapter<IcsEvent>()),
  );
  return { bridged, calendar, expansion, parseIssues, snapshot };
}

type Expansion = ReturnType<typeof expandFixture>["expansion"];

/** Instants as wall-clock time in `timeZone`, to the minute; dates as they are. */
function wallClock(date: RecurrenceDate, timeZone: string): string {
  return date instanceof Temporal.Instant
    ? date.toZonedDateTimeISO(timeZone).toPlainDateTime().toString({ smallestUnit: "minute" })
    : date.toString();
}

/**
 * A series' occurrences by original start, as their recurrence key and their wall-clock start and
 * end in `timeZone`. Checks on the way that each ID is `<UID>::<recurrence key>`.
 */
function occurrencesOf(expansion: Expansion, seriesId: string, timeZone: string) {
  return expansion.occurrences
    .filter((occurrence) => occurrence.recurrence?.seriesId === seriesId)
    .map(({ id, interval, recurrence }) => {
      const key = recurrenceKey(recurrence!.recurrenceId);
      expect(id).toBe(`${seriesId}::${key}`);
      return [key, wallClock(interval.start, timeZone), wallClock(interval.end, timeZone)];
    })
    .sort(([left], [right]) => left!.localeCompare(right!));
}

/** The wall-clock starts of `occurrencesOf`, in another time zone. */
function startsIn(expansion: Expansion, seriesId: string, timeZone: string): string[] {
  return occurrencesOf(expansion, seriesId, timeZone).map(([, start]) => start!);
}

/** A series' overrides that show, as recurrence key and title. */
function overridesOf(expansion: Expansion, seriesId: string) {
  return expansion.occurrences
    .filter((occurrence) => occurrence.recurrence?.override !== undefined)
    .filter((occurrence) => occurrence.recurrence?.seriesId === seriesId)
    .map(({ event, recurrence }) => [recurrenceKey(recurrence!.recurrenceId), event.title]);
}

describe("Google Calendar export", () => {
  const google = "google-recurring.ics";
  const uid = {
    plants: "2w4e6r8t0y1u3i5o7p9a2s4d6f@google.com",
    recycling: "9z8x7c6v5b4n3m2l1k0j9h8g7f@google.com",
    review: "7h3j5k8l2p4o6i9u1y3t5r7e0w@google.com",
    standup: "4q2v8n1m7c3k9x5z0b6t2r8w1y@google.com",
  };

  test("parses and bridges without issues", () => {
    const { bridged, calendar, expansion, parseIssues, snapshot } = expandFixture(
      google,
      "2026-01-01",
      "2026-07-01",
      "America/New_York",
    );
    expect(parseIssues).toEqual([]);
    expect(calendar.timeZone).toBe("America/New_York");
    expect(bridged.issues).toEqual([]);
    expect(expansion.issues).toEqual([]);
    expect(snapshot.issues).toEqual([]);
    expect(snapshot.size).toBe(expansion.occurrences.length);
  });

  test("expands a Tuesday and Thursday standup across US DST, with its exceptions and overrides", () => {
    const { bridged, expansion } = expandFixture(
      google,
      "2026-02-01",
      "2026-04-15",
      "America/New_York",
    );
    // UNTIL is the end of 7 April in New York, in UTC, so 9 April is the first one left out.
    const master = bridged.events.find((event) => event.id === uid.standup);
    expect(String(master?.recurrence?.rule?.until)).toBe("2026-04-08T03:59:59Z");

    // 9:30 stays 9:30 in New York. The EXDATEs, one zoned and one in UTC, remove 5 and 12 March;
    // the cancelled override hides 26 March. The RDATE adds 1 April at 16:00, as long as the first.
    // 19 March moved to 11:00, and 2 April became an all-day event under its original key.
    expect(occurrencesOf(expansion, uid.standup, "America/New_York")).toEqual([
      ["2026-02-24T14:30:00Z", "2026-02-24T09:30", "2026-02-24T09:45"],
      ["2026-02-26T14:30:00Z", "2026-02-26T09:30", "2026-02-26T09:45"],
      ["2026-03-03T14:30:00Z", "2026-03-03T09:30", "2026-03-03T09:45"],
      ["2026-03-10T13:30:00Z", "2026-03-10T09:30", "2026-03-10T09:45"],
      ["2026-03-17T13:30:00Z", "2026-03-17T09:30", "2026-03-17T09:45"],
      ["2026-03-19T13:30:00Z", "2026-03-19T11:00", "2026-03-19T11:15"],
      ["2026-03-24T13:30:00Z", "2026-03-24T09:30", "2026-03-24T09:45"],
      ["2026-03-31T13:30:00Z", "2026-03-31T09:30", "2026-03-31T09:45"],
      ["2026-04-01T20:00:00Z", "2026-04-01T16:00", "2026-04-01T16:15"],
      ["2026-04-02T13:30:00Z", "2026-04-02", "2026-04-03"],
      ["2026-04-07T13:30:00Z", "2026-04-07T09:30", "2026-04-07T09:45"],
    ]);
    // Berlin is six hours ahead, but five between the US change and Europe's on 29 March.
    expect(startsIn(expansion, uid.standup, "Europe/Berlin")).toEqual([
      "2026-02-24T15:30",
      "2026-02-26T15:30",
      "2026-03-03T15:30",
      "2026-03-10T14:30",
      "2026-03-17T14:30",
      "2026-03-19T16:00",
      "2026-03-24T14:30",
      "2026-03-31T15:30",
      "2026-04-01T22:00",
      "2026-04-02",
      "2026-04-07T15:30",
    ]);
    expect(overridesOf(expansion, uid.standup)).toEqual([
      ["2026-03-19T13:30:00Z", "Standup (after the all-hands)"],
      ["2026-04-02T13:30:00Z", "Standup (async, offsite day)"],
    ]);

    // Google's cancelled instance is an override with STATUS:CANCELLED, under the same ID scheme.
    expect(
      bridged.events.filter((event) => event.override?.cancelled === true).map(({ id }) => id),
    ).toEqual(["4q2v8n1m7c3k9x5z0b6t2r8w1y@google.com::2026-03-26T13:30:00Z"]);
  });

  test("counts the second-Tuesday review from its first occurrence when the range starts later", () => {
    const { bridged, expansion } = expandFixture(
      google,
      "2026-03-01",
      "2026-08-01",
      "America/New_York",
    );
    // COUNT=6 runs January to June, so July has none. 14 April moved to Wednesday 15 April, and
    // June's review was held in London at 14:00 there, 9:00 in New York.
    expect(occurrencesOf(expansion, uid.review, "America/New_York")).toEqual([
      ["2026-03-10T18:00:00Z", "2026-03-10T14:00", "2026-03-10T15:00"],
      ["2026-04-14T18:00:00Z", "2026-04-15T14:00", "2026-04-15T15:00"],
      ["2026-05-12T18:00:00Z", "2026-05-12T14:00", "2026-05-12T15:00"],
      ["2026-06-09T18:00:00Z", "2026-06-09T09:00", "2026-06-09T10:00"],
    ]);
    // The London override keeps its own zone, and its RECURRENCE-ID names the New York start.
    const london = bridged.events.find((event) => event.title.endsWith("(London)"));
    expect(london).toMatchObject({
      id: "7h3j5k8l2p4o6i9u1y3t5r7e0w@google.com::2026-06-09T18:00:00Z",
      kind: "timed",
      sourceTimeZone: "Europe/London",
    });
    expect(startsIn(expansion, uid.review, "Europe/London")[3]).toBe("2026-06-09T14:00");
  });

  test("gives a zero-length reminder every other day 30 minutes", () => {
    const { expansion } = expandFixture(google, "2026-03-01", "2026-04-01", "America/New_York");
    // DTEND equals DTSTART, so each lasts the bridge's 30-minute minimum. 8:00 stays 8:00 when
    // New York moves to daylight time on 8 March.
    expect(occurrencesOf(expansion, uid.plants, "America/New_York")).toEqual([
      ["2026-03-05T13:00:00Z", "2026-03-05T08:00", "2026-03-05T08:30"],
      ["2026-03-07T13:00:00Z", "2026-03-07T08:00", "2026-03-07T08:30"],
      ["2026-03-09T12:00:00Z", "2026-03-09T08:00", "2026-03-09T08:30"],
      ["2026-03-11T12:00:00Z", "2026-03-11T08:00", "2026-03-11T08:30"],
      ["2026-03-13T12:00:00Z", "2026-03-13T08:00", "2026-03-13T08:30"],
    ]);
  });

  test("repeats the all-day recycling day through its date-only UNTIL", () => {
    const { expansion } = expandFixture(google, "2026-03-01", "2026-06-01", "America/New_York");
    // Two EXDATE;VALUE=DATE lines remove 23 March and 6 April, the RDATE adds Wednesday 1 April,
    // 13 April moved a day, and UNTIL=20260427 keeps 27 April but not 4 May.
    expect(occurrencesOf(expansion, uid.recycling, "America/New_York")).toEqual([
      ["2026-03-02", "2026-03-02", "2026-03-03"],
      ["2026-03-09", "2026-03-09", "2026-03-10"],
      ["2026-03-16", "2026-03-16", "2026-03-17"],
      ["2026-03-30", "2026-03-30", "2026-03-31"],
      ["2026-04-01", "2026-04-01", "2026-04-02"],
      ["2026-04-13", "2026-04-14", "2026-04-15"],
      ["2026-04-20", "2026-04-20", "2026-04-21"],
      ["2026-04-27", "2026-04-27", "2026-04-28"],
    ]);
    // All-day dates don't depend on the zone they're shown in.
    expect(startsIn(expansion, uid.recycling, "Asia/Tokyo")[0]).toBe("2026-03-02");
    expect(overridesOf(expansion, uid.recycling)).toEqual([
      ["2026-04-13", "Recycling pickup (a day late)"],
    ]);
  });

  test("gives overrides the same IDs without their series, as an invitation to one occurrence has", () => {
    const { calendar } = readCalendar(google);
    const ids = (events: readonly IcsEvent[]) =>
      recurringEventsFromIcs(events, { timeZone: "America/New_York" })
        .events.filter((event) => event.override !== undefined)
        .map(({ id }) => id);
    const overrides = calendar.events.filter((event) => event.recurrenceId !== undefined);
    expect(ids(overrides)).toEqual(ids(calendar.events));
    expect(ids(overrides)).toHaveLength(6);
  });
});

describe("Outlook export", () => {
  const outlook = "outlook-recurring.ics";
  const prefix = "040000008200E00074C5B7101A82E00800000000";
  const uid = {
    batch: `${prefix}30C3D4E5F6A7DC01000000000000000010000000CD34EF56AB78CD90EF12AB34CD56EF78`,
    board: `${prefix}20B2C3D4E5F6DB01000000000000000010000000BC23DE45FA67BC89DE01FA23BC45DE67`,
    holiday: `${prefix}50E5F6A7B8C9DB01000000000000000010000000EF56AB78CD90EF12AB34CD56EF78AB90`,
    team: `${prefix}10A1B2C3D4E5DC01000000000000000010000000AB12CD34EF56AB78CD90EF12AB34CD56`,
    vendor: `${prefix}60F6A7B8C9D0DC01000000000000000010000000FA67BC89DE01FA23BC45DE67FA89BC01`,
    wfh: `${prefix}40D4E5F6A7B8DC01000000000000000010000000DE45FA67BC89DE01FA23BC45DE67FA89`,
  };

  test("resolves Outlook's Windows time zones and bridges without issues", () => {
    const { bridged, calendar, expansion, parseIssues, snapshot } = expandFixture(
      outlook,
      "2026-01-01",
      "2027-01-01",
      "Europe/Berlin",
    );
    expect(parseIssues).toEqual([]);
    // Outlook writes no X-WR-TIMEZONE.
    expect(calendar.timeZone).toBeUndefined();
    const zoneOf = (id: string) => {
      const event = bridged.events.find((item) => item.id === id);
      return event?.kind === "timed" ? event.sourceTimeZone : event?.kind;
    };
    expect([uid.team, uid.board, uid.batch, uid.wfh, uid.holiday].map(zoneOf)).toEqual([
      "Europe/Berlin",
      "America/New_York",
      "Australia/Sydney",
      "all-day",
      "all-day",
    ]);
    expect(bridged.issues).toEqual([]);
    expect(expansion.issues).toEqual([]);
    expect(snapshot.issues).toEqual([]);
    expect(snapshot.size).toBe(expansion.occurrences.length);
  });

  test("leaves out a series its organizer cancelled, with its exception", () => {
    const { bridged, calendar, expansion } = expandFixture(
      outlook,
      "2026-07-01",
      "2027-01-01",
      "Europe/Berlin",
    );
    // An attendee's Outlook keeps it as "Canceled: …" with STATUS:CANCELLED. Its exception isn't
    // cancelled itself, but goes with the series, without an issue (#157).
    expect(calendar.events.filter((event) => event.uid === uid.vendor)).toHaveLength(2);
    expect(bridged.events.filter((event) => event.id.startsWith(uid.vendor))).toEqual([]);
    expect(expansion.occurrences.filter(({ id }) => String(id).startsWith(uid.vendor))).toEqual([]);
    expect(bridged.issues).toEqual([]);
  });

  test("expands the Berlin team meeting across Europe's DST end, a week before New York's", () => {
    const { expansion } = expandFixture(outlook, "2026-10-01", "2026-12-01", "Europe/Berlin");
    // One EXDATE line with two values removes 1 and 22 October. Outlook's UNTIL is the last
    // start in UTC, 16 November at 9:00 in Berlin, which RFC 5545 keeps.
    expect(occurrencesOf(expansion, uid.team, "Europe/Berlin")).toEqual([
      ["2026-10-05T07:00:00Z", "2026-10-05T09:00", "2026-10-05T09:30"],
      ["2026-10-08T07:00:00Z", "2026-10-08T09:00", "2026-10-08T09:30"],
      ["2026-10-12T07:00:00Z", "2026-10-12T09:00", "2026-10-12T09:30"],
      ["2026-10-15T07:00:00Z", "2026-10-15T14:00", "2026-10-15T14:30"],
      ["2026-10-19T07:00:00Z", "2026-10-19T09:00", "2026-10-19T09:30"],
      ["2026-10-26T08:00:00Z", "2026-10-26T09:00", "2026-10-26T09:30"],
      ["2026-10-29T08:00:00Z", "2026-10-29T09:00", "2026-10-29T09:30"],
      ["2026-11-02T08:00:00Z", "2026-11-02T09:00", "2026-11-02T09:30"],
      ["2026-11-05T08:00:00Z", "2026-11-05T09:00", "2026-11-05T09:30"],
      ["2026-11-09T08:00:00Z", "2026-11-09T09:00", "2026-11-09T09:30"],
      ["2026-11-12T08:00:00Z", "2026-11-12T09:00", "2026-11-12T09:30"],
      ["2026-11-16T08:00:00Z", "2026-11-16T09:00", "2026-11-16T09:30"],
    ]);
    // New York sees 3:00, then 4:00 in the week between the two DST ends, then 3:00 again.
    expect(startsIn(expansion, uid.team, "America/New_York")).toEqual([
      "2026-10-05T03:00",
      "2026-10-08T03:00",
      "2026-10-12T03:00",
      "2026-10-15T08:00",
      "2026-10-19T03:00",
      "2026-10-26T04:00",
      "2026-10-29T04:00",
      "2026-11-02T03:00",
      "2026-11-05T03:00",
      "2026-11-09T03:00",
      "2026-11-12T03:00",
      "2026-11-16T03:00",
    ]);
    expect(overridesOf(expansion, uid.team)).toEqual([
      ["2026-10-15T07:00:00Z", "Team meeting (offsite, afternoon)"],
    ]);
  });

  test("expands the second-Thursday board call, written with BYSETPOS, across US DST", () => {
    const { expansion } = expandFixture(outlook, "2026-01-01", "2026-07-01", "America/New_York");
    // BYDAY=TH;BYSETPOS=2 is the second Thursday; COUNT=4 ends in April. Berlin sees 15:00 on
    // 12 March, between the US change and Europe's.
    expect(occurrencesOf(expansion, uid.board, "America/New_York")).toEqual([
      ["2026-01-08T15:00:00Z", "2026-01-08T10:00", "2026-01-08T11:00"],
      ["2026-02-12T15:00:00Z", "2026-02-12T10:00", "2026-02-12T11:00"],
      ["2026-03-12T14:00:00Z", "2026-03-12T10:00", "2026-03-12T11:00"],
      ["2026-04-09T14:00:00Z", "2026-04-09T10:00", "2026-04-09T11:00"],
    ]);
    expect(startsIn(expansion, uid.board, "Europe/Berlin")).toEqual([
      "2026-01-08T16:00",
      "2026-02-12T16:00",
      "2026-03-12T15:00",
      "2026-04-09T16:00",
    ]);
  });

  test("keeps the Sydney batch window an hour long through the repeated and the skipped 2:30", () => {
    const autumn = expandFixture(outlook, "2026-03-29", "2026-04-13", "Australia/Sydney");
    // On 5 April 2:30 happens twice and takes the first, in daylight time. The hour after it ends
    // at the second 2:30, in standard time.
    expect(occurrencesOf(autumn.expansion, uid.batch, "Australia/Sydney")).toEqual([
      ["2026-03-28T15:30:00Z", "2026-03-29T02:30", "2026-03-29T03:30"],
      ["2026-04-04T15:30:00Z", "2026-04-05T02:30", "2026-04-05T02:30"],
      ["2026-04-11T16:30:00Z", "2026-04-12T02:30", "2026-04-12T03:30"],
    ]);
    expect(startsIn(autumn.expansion, uid.batch, "Europe/Berlin")).toEqual([
      "2026-03-28T16:30",
      "2026-04-04T17:30",
      "2026-04-11T18:30",
    ]);

    const spring = expandFixture(outlook, "2026-09-27", "2026-10-19", "Australia/Sydney");
    // On 4 October 2:30 doesn't exist; it moves forward to 3:30 and counts (ADR 0048). UNTIL is
    // 11 October's start, so 18 October is left out.
    expect(occurrencesOf(spring.expansion, uid.batch, "Australia/Sydney")).toEqual([
      ["2026-09-26T16:30:00Z", "2026-09-27T02:30", "2026-09-27T03:30"],
      ["2026-10-03T16:30:00Z", "2026-10-04T03:30", "2026-10-04T04:30"],
      ["2026-10-10T15:30:00Z", "2026-10-11T02:30", "2026-10-11T03:30"],
    ]);
    expect(startsIn(spring.expansion, uid.batch, "Europe/Berlin")).toEqual([
      "2026-09-26T18:30",
      "2026-10-03T18:30",
      "2026-10-10T17:30",
    ]);
  });

  test("repeats all-day series flagged X-MICROSOFT-CDO-ALLDAYEVENT on their dates", () => {
    const { expansion } = expandFixture(outlook, "2026-11-01", "2027-01-16", "Europe/Berlin");
    // EXDATE;VALUE=DATE with two values removes 27 November and 25 December, 11 December moved
    // to Thursday, and UNTIL=20261231 ends the series before Friday 1 January.
    expect(occurrencesOf(expansion, uid.wfh, "Europe/Berlin")).toEqual([
      ["2026-11-06", "2026-11-06", "2026-11-07"],
      ["2026-11-13", "2026-11-13", "2026-11-14"],
      ["2026-11-20", "2026-11-20", "2026-11-21"],
      ["2026-12-04", "2026-12-04", "2026-12-05"],
      ["2026-12-11", "2026-12-10", "2026-12-11"],
      ["2026-12-18", "2026-12-18", "2026-12-19"],
    ]);
    expect(overridesOf(expansion, uid.wfh)).toEqual([
      ["2026-12-11", "Working from home (Thursday this week)"],
    ]);

    const years = expandFixture(outlook, "2026-01-01", "2029-01-01", "Europe/Berlin");
    expect(occurrencesOf(years.expansion, uid.holiday, "Europe/Berlin")).toEqual([
      ["2026-10-03", "2026-10-03", "2026-10-04"],
      ["2027-10-03", "2027-10-03", "2027-10-04"],
      ["2028-10-03", "2028-10-03", "2028-10-04"],
    ]);
  });
});

describe("iCloud export", () => {
  const icloud = "icloud-recurring.ics";
  const uid = {
    advent: "E5D4C3B2-A1F0-4E9D-8C7B-6A5F4E3D2C1B",
    bookClub: "8A7B6C5D-4E3F-4A2B-9C1D-0E9F8A7B6C5D",
    call: "5E2D8C1A-3B4F-4A6E-9D7C-2F1B0A9E8D7C",
    leo: "C3B2A190-8F7E-4D6C-9B5A-4E3D2C1B0A98",
    maya: "D4C3B2A1-9F8E-4D7C-8B6A-5F4E3D2C1B0A",
  };

  test("reports the bridge issues of its two quirks, and expands without any", () => {
    const { bridged, calendar, expansion, parseIssues, snapshot } = expandFixture(
      icloud,
      "2026-01-01",
      "2027-01-01",
      "America/New_York",
    );
    expect(parseIssues).toEqual([]);
    expect(calendar.timeZone).toBe("America/New_York");
    expect(bridged.issues.map(({ code, event, property }) => [code, event.uid, property])).toEqual([
      ["unsupported-rule", uid.bookClub, "RECURRENCE-ID"],
      ["date-kind-mismatch", uid.advent, "RRULE"],
    ]);
    expect(expansion.issues).toEqual([]);
    expect(snapshot.issues).toEqual([]);
    expect(snapshot.size).toBe(expansion.occurrences.length);
  });

  test("expands the Sydney family call across Sydney's DST start and New York's DST end", () => {
    const { expansion } = expandFixture(icloud, "2026-09-01", "2026-12-01", "America/New_York");
    // 10:00 stays 10:00 in Sydney. COUNT=8 counts the excluded 11 October, so 8 November is the
    // last. 25 October moved to 16:00.
    expect(occurrencesOf(expansion, uid.call, "Australia/Sydney")).toEqual([
      ["2026-09-20T00:00:00Z", "2026-09-20T10:00", "2026-09-20T11:00"],
      ["2026-09-27T00:00:00Z", "2026-09-27T10:00", "2026-09-27T11:00"],
      ["2026-10-03T23:00:00Z", "2026-10-04T10:00", "2026-10-04T11:00"],
      ["2026-10-17T23:00:00Z", "2026-10-18T10:00", "2026-10-18T11:00"],
      ["2026-10-24T23:00:00Z", "2026-10-25T16:00", "2026-10-25T17:00"],
      ["2026-10-31T23:00:00Z", "2026-11-01T10:00", "2026-11-01T11:00"],
      ["2026-11-07T23:00:00Z", "2026-11-08T10:00", "2026-11-08T11:00"],
    ]);
    // New York sees Saturday 20:00, 19:00 once Sydney moves on 4 October, 18:00 once New York
    // moves on 1 November.
    expect(startsIn(expansion, uid.call, "America/New_York")).toEqual([
      "2026-09-19T20:00",
      "2026-09-26T20:00",
      "2026-10-03T19:00",
      "2026-10-17T19:00",
      "2026-10-25T01:00",
      "2026-10-31T19:00",
      "2026-11-07T18:00",
    ]);
    expect(overridesOf(expansion, uid.call)).toEqual([
      ["2026-10-24T23:00:00Z", "Family call with Mum and Dad (after the school concert)"],
    ]);
  });

  test("places the range's dates in the calendar's time zone", () => {
    // Generated occurrences only: overrides show whatever the range.
    const keys = (start: string, end: string, timeZone: string) =>
      expandFixture(icloud, start, end, timeZone)
        .expansion.occurrences.filter(
          ({ recurrence }) =>
            recurrence?.seriesId === uid.call && recurrence.override === undefined,
        )
        .map((occurrence) => recurrenceKey(occurrence.recurrence!.recurrenceId));
    // The call on Sunday 4 October in Sydney is Saturday 3 October in New York.
    expect(keys("2026-10-03", "2026-10-04", "America/New_York")).toEqual(["2026-10-03T23:00:00Z"]);
    expect(keys("2026-10-03", "2026-10-04", "Australia/Sydney")).toEqual([]);
    expect(keys("2026-10-04", "2026-10-05", "Australia/Sydney")).toEqual(["2026-10-03T23:00:00Z"]);
  });

  test("moves only the occurrence a RANGE=THISANDFUTURE override names, as ADR 0048 decides", () => {
    const { expansion } = expandFixture(icloud, "2026-04-01", "2026-08-01", "America/New_York");
    // Apple meant 18:30 from 29 May on; the bridge reports unsupported-rule and later last
    // Fridays keep 19:00.
    expect(occurrencesOf(expansion, uid.bookClub, "America/New_York")).toEqual([
      ["2026-04-24T23:00:00Z", "2026-04-24T19:00", "2026-04-24T21:00"],
      ["2026-05-29T23:00:00Z", "2026-05-29T18:30", "2026-05-29T20:30"],
      ["2026-06-26T23:00:00Z", "2026-06-26T19:00", "2026-06-26T21:00"],
      ["2026-07-31T23:00:00Z", "2026-07-31T19:00", "2026-07-31T21:00"],
    ]);
  });

  test("repeats birthdays every year, one on 29 February only in leap years", () => {
    const { expansion } = expandFixture(icloud, "2026-01-01", "2029-01-01", "America/New_York");
    // RFC 5545 skips dates that don't exist, so 2026 and 2027 have no 29 February.
    expect(occurrencesOf(expansion, uid.leo, "America/New_York")).toEqual([
      ["2028-02-29", "2028-02-29", "2028-03-01"],
    ]);
    expect(occurrencesOf(expansion, uid.maya, "America/New_York")).toEqual([
      ["2026-06-12", "2026-06-12", "2026-06-13"],
      ["2027-06-12", "2027-06-12", "2027-06-13"],
      ["2028-06-12", "2028-06-12", "2028-06-13"],
    ]);
  });

  test("reads a UTC UNTIL on an all-day series in the feed's X-WR-TIMEZONE", () => {
    // UNTIL=20261225T045959Z is the end of 24 December in New York, but already 25 December in
    // UTC, which would add a day.
    const days = (options: IcsRecurringEventsOptions) => {
      const { bridged, expansion } = expandFixture(
        icloud,
        "2026-12-20",
        "2027-01-01",
        "America/New_York",
        options,
      );
      const master = bridged.events.find((event) => event.id === uid.advent);
      return {
        days: occurrencesOf(expansion, uid.advent, "America/New_York").map(([key]) => key),
        until: String(master?.recurrence?.rule?.until),
      };
    };
    expect(days({})).toEqual({
      days: ["2026-12-20", "2026-12-21", "2026-12-22", "2026-12-23", "2026-12-24"],
      until: "2026-12-24",
    });
    expect(days({ timeZone: "UTC" })).toMatchObject({ until: "2026-12-25" });
  });
});
