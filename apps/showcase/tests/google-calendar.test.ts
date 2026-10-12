import {
  createCanonicalRecurrenceAdapter,
  createOccurrenceExpander,
} from "@moltenship/calendar-recurrence";
import { describe, expect, test } from "vite-plus/test";

import {
  fromGoogleEvents,
  readGoogleRecurrence,
  toGoogleRecurrence,
  type GoogleEvent,
} from "../content/examples/google-calendar";

const berlin = "Europe/Berlin";
const instant = (value: string) => Temporal.Instant.from(value);
const wall = (date: unknown) =>
  date instanceof Temporal.Instant ? date.toZonedDateTimeISO(berlin).toString() : String(date);

describe("readGoogleRecurrence", () => {
  test("reads RRULE, and EXDATE and RDATE in a time zone, in UTC and as dates", () => {
    const { problems, recurrence } = readGoogleRecurrence([
      "RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261231T225959Z",
      "EXDATE;TZID=Europe/Berlin:20261019T090000,20261021T090000",
      "EXDATE:20261026T080000Z",
      "EXDATE;VALUE=DATE:20261028",
      "RDATE;TZID=Europe/Berlin:20261024T100000",
    ]);
    expect(problems).toEqual([]);
    expect(recurrence.rule).toMatchObject({
      byDay: [{ weekday: "MO" }, { weekday: "WE" }],
      frequency: "WEEKLY",
    });
    expect(recurrence.rule?.until?.toString()).toBe("2026-12-31T22:59:59Z");
    expect(recurrence.exceptionDates?.map(wall)).toEqual([
      "2026-10-19T09:00:00+02:00[Europe/Berlin]",
      "2026-10-21T09:00:00+02:00[Europe/Berlin]",
      "2026-10-26T09:00:00+01:00[Europe/Berlin]",
      "2026-10-28",
    ]);
    expect(recurrence.recurrenceDates?.map(wall)).toEqual([
      "2026-10-24T10:00:00+02:00[Europe/Berlin]",
    ]);
  });

  test("reports what it can't read and keeps the rest", () => {
    const { problems, recurrence } = readGoogleRecurrence([
      "RRULE:FREQ=DAILY",
      "EXRULE:FREQ=WEEKLY",
      "RDATE;VALUE=PERIOD:20261024T100000Z/PT1H",
      "EXDATE;TZID=Head office:20261019T090000",
      "EXDATE:not-a-date",
    ]);
    expect(recurrence.rule).toMatchObject({ frequency: "DAILY" });
    expect(recurrence.exceptionDates).toEqual([]);
    expect(recurrence.recurrenceDates).toEqual([]);
    expect(problems).toEqual([
      "EXRULE isn't supported",
      "RDATE;VALUE=PERIOD isn't read",
      "EXDATE: can't read 20261019T090000",
      "EXDATE: can't read not-a-date",
    ]);
  });

  test("passes on the rule's problems", () => {
    expect(readGoogleRecurrence(["RRULE:INTERVAL=2"]).problems).toHaveLength(1);
  });
});

describe("fromGoogleEvents", () => {
  const master: GoogleEvent = {
    end: { dateTime: "2026-10-19T09:30:00+02:00", timeZone: berlin },
    id: "standup",
    recurrence: ["RRULE:FREQ=DAILY;COUNT=5", "EXDATE;TZID=Europe/Berlin:20261021T090000"],
    start: { dateTime: "2026-10-19T09:00:00+02:00", timeZone: berlin },
    status: "confirmed",
    summary: "Stand-up",
  };
  const moved: GoogleEvent = {
    end: { dateTime: "2026-10-20T11:30:00", timeZone: berlin },
    id: "standup_20261020T070000Z",
    originalStartTime: { dateTime: "2026-10-20T09:00:00+02:00", timeZone: berlin },
    recurringEventId: "standup",
    start: { dateTime: "2026-10-20T11:00:00", timeZone: berlin },
    status: "confirmed",
    summary: "Stand-up (late)",
  };
  const cancelled: GoogleEvent = {
    id: "standup_20261022T070000Z",
    originalStartTime: { dateTime: "2026-10-22T09:00:00+02:00", timeZone: berlin },
    recurringEventId: "standup",
    status: "cancelled",
  };
  const allDay: GoogleEvent = {
    end: { date: "2026-10-24" },
    id: "offsite",
    start: { date: "2026-10-23" },
    summary: "Offsite",
  };

  test("maps masters, changed and cancelled occurrences, and one-off events", () => {
    const { events, problems } = fromGoogleEvents([
      master,
      moved,
      cancelled,
      allDay,
      { id: "gone", status: "cancelled" },
    ]);
    expect(problems).toEqual([]);
    expect(events.map((event) => [event.id, event.title, event.kind])).toEqual([
      ["standup", "Stand-up", "timed"],
      ["standup_20261020T070000Z", "Stand-up (late)", "timed"],
      ["standup_20261022T070000Z", "(No title)", "timed"],
      ["offsite", "Offsite", "all-day"],
    ]);
    expect(events[0]).toMatchObject({ sourceTimeZone: berlin });
    expect(events[1]?.start.toString()).toBe("2026-10-20T09:00:00Z");
    expect(events[2]?.override).toMatchObject({ cancelled: true, seriesId: "standup" });
    expect(events[2]?.override?.recurrenceId.toString()).toBe("2026-10-22T07:00:00Z");
  });

  test("expands to the series, with its moved, cancelled and excluded occurrences", () => {
    const { events } = fromGoogleEvents([master, moved, cancelled, allDay]);
    const expander = createOccurrenceExpander(createCanonicalRecurrenceAdapter<GoogleEvent>());
    const { issues, occurrences } = expander.expand(events, {
      range: {
        end: Temporal.PlainDate.from("2026-10-26"),
        start: Temporal.PlainDate.from("2026-10-19"),
      },
      timeZone: berlin,
    });
    expect(issues).toEqual([]);
    expect(
      occurrences.map((occurrence) => [occurrence.id, wall(occurrence.interval.start)]),
    ).toEqual([
      ["standup::2026-10-19T07:00:00Z", "2026-10-19T09:00:00+02:00[Europe/Berlin]"],
      ["standup::2026-10-23T07:00:00Z", "2026-10-23T09:00:00+02:00[Europe/Berlin]"],
      ["standup::2026-10-20T07:00:00Z", "2026-10-20T11:00:00+02:00[Europe/Berlin]"],
      ["offsite", "2026-10-23"],
    ]);
  });

  test("reports events it can't place", () => {
    const { events, problems } = fromGoogleEvents([
      { id: "no-times", summary: "Lost" },
      { id: "orphan", recurringEventId: "standup", status: "cancelled" },
    ]);
    expect(events).toEqual([]);
    expect(problems).toEqual(["no-times: no start or end", "orphan: no original start"]);
  });
});

describe("toGoogleRecurrence", () => {
  test("writes lines that read back to the same recurrence", () => {
    const lines = [
      "RRULE:FREQ=WEEKLY;UNTIL=20261231T225959Z;BYDAY=MO,WE",
      "EXDATE;TZID=Europe/Berlin:20261019T090000",
      "EXDATE;VALUE=DATE:20261028",
      "RDATE;TZID=Europe/Berlin:20261024T100000",
    ];
    const { recurrence } = readGoogleRecurrence(lines);
    expect(toGoogleRecurrence(recurrence, berlin)).toEqual(lines);
  });

  test("writes instants in UTC without a time zone", () => {
    expect(
      toGoogleRecurrence({ exceptionDates: [instant("2026-10-19T07:00:00Z")] }, undefined),
    ).toEqual(["EXDATE:20261019T070000Z"]);
  });
});
