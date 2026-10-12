import type { CalendarEventChange } from "@moltenship/calendar";
import {
  createOccurrenceExpander,
  resolveRecurrenceEdit,
  type RecurrenceEditScope,
} from "@moltenship/calendar-recurrence";
import { describe, expect, test } from "vite-plus/test";

import {
  createFakeGoogleCalendar,
  fakeGoogleBaseUrl,
} from "../components/google-calendar-preview/fake-google-calendar";
import { createSeedEvents, instanceId } from "../components/google-calendar-preview/seed";
import { createGoogleCalendarApi, GoogleApiError } from "../content/examples/google-calendar-api";
import { adapters, type GoogleOccurrence } from "../content/examples/google-calendar-root";
import {
  createGoogleCalendarSync,
  toGoogleTimes,
  type GoogleCalendarSync,
} from "../content/examples/google-calendar-sync";

const timeZone = "Europe/Berlin";
// A Wednesday, at 10:00: the seed's stand-up is at 09:00, planning and the 1:1 at 11:00.
const now = Temporal.ZonedDateTime.from("2026-10-14T10:00[Europe/Berlin]");
const monday = Temporal.PlainDate.from("2026-10-12");
const at = (date: string, time: string) =>
  Temporal.PlainDateTime.from(`${date}T${time}`).toZonedDateTime(timeZone);

function setup({ pageSize = 4 } = {}) {
  const google = createFakeGoogleCalendar({ events: createSeedEvents(now), pageSize, timeZone });
  const api = createGoogleCalendarApi({
    baseUrl: fakeGoogleBaseUrl,
    fetch: google.fetch,
    retryDelay: () => 0,
  });
  return { api, google, sync: createGoogleCalendarSync(api) };
}

/** The week from `start` as instants, as `loadInstantRange` reports it. */
function week(start: Temporal.PlainDate) {
  return {
    end: start.add({ days: 7 }).toZonedDateTime(timeZone).toInstant(),
    start: start.toZonedDateTime(timeZone).toInstant(),
  };
}

/** `events.list`'s `timeMin` and `timeMax` for the week from `start`. */
function between(start: Temporal.PlainDate) {
  const { end, start: from } = week(start);
  return { timeMax: end, timeMin: from };
}

/** The occurrences the calendar shows for the week from `start`. */
function shown(sync: GoogleCalendarSync, start = monday) {
  const expander = createOccurrenceExpander(adapters);
  return expander.expand(sync.getEvents(), {
    range: { end: start.add({ days: 7 }), start },
    timeZone,
  }).occurrences;
}

/** Each occurrence as its title and start on the Berlin clock. */
function titles(sync: GoogleCalendarSync, start = monday) {
  return shown(sync, start)
    .map(({ event, interval }) => {
      const when =
        interval.kind === "timed"
          ? interval.start.toZonedDateTimeISO(timeZone).toPlainDateTime().toString()
          : interval.start.toString();
      return `${when} ${event.title}`;
    })
    .sort();
}

const requests = (google: ReturnType<typeof setup>["google"]) =>
  google
    .getLog()
    .filter((entry) => entry.kind === "request")
    .map((entry) => `${entry.text.split("?")[0]!.split(" If-Match")[0]} ${entry.status}`);

/** A drag of `occurrence` to `start`, as the calendar hands it to `onEventChange`. */
function move(occurrence: GoogleOccurrence, start: Temporal.ZonedDateTime) {
  const { interval } = occurrence;
  if (interval.kind !== "timed") throw new Error("Timed occurrences only");
  const duration = interval.start.until(interval.end);
  return {
    cause: "move",
    event: occurrence,
    eventId: occurrence.id,
    id: "change",
    original: { ...interval, resourceIds: [] },
    proposed: {
      end: start.toInstant().add(duration),
      kind: "timed",
      resourceIds: [],
      start: start.toInstant(),
    },
  } satisfies CalendarEventChange<GoogleOccurrence, string, string>;
}

function remove(occurrence: GoogleOccurrence) {
  return {
    cause: "delete",
    event: occurrence,
    eventId: occurrence.id,
    id: "change",
    original: { ...occurrence.interval, resourceIds: [] },
    proposed: null,
  } satisfies CalendarEventChange<GoogleOccurrence, string, string>;
}

async function save(
  sync: GoogleCalendarSync,
  change: CalendarEventChange<GoogleOccurrence, string, string>,
  scope: RecurrenceEditScope,
) {
  const edit = resolveRecurrenceEdit(change, scope, adapters, {
    newSeriesId: "standup2",
    occurrences: shown(sync),
    timeZone,
  });
  if (edit.type === "rejected") throw new Error(edit.message);
  await sync.save(edit, timeZone);
}

function find(sync: GoogleCalendarSync, id: string) {
  const found = shown(sync).find((occurrence) => occurrence.id === id);
  if (found === undefined) throw new Error(`${id} isn't shown`);
  return found;
}

const thisWeek = [
  "2026-10-12T09:00:00 Stand-up",
  "2026-10-12T11:00:00 Planning",
  "2026-10-13T09:00:00 Stand-up",
  "2026-10-13T11:00:00 1:1 with Sam",
  "2026-10-14T11:30:00 Design review",
  "2026-10-15T10:00:00 Stand-up (late)",
  "2026-10-15T11:00:00 Focus time",
  "2026-10-16 Release day",
  "2026-10-16T09:00:00 Stand-up",
];

describe("the Calendar API client", () => {
  test("reads every page, and returns the sync token from the last", async () => {
    const { api, google } = setup({ pageSize: 2 });
    const { items, nextSyncToken } = await api.list(between(monday));
    expect(items.map((item) => item.id)).toContain("review");
    expect(nextSyncToken).toBeDefined();
    const pages = google.getLog().filter((entry) => entry.kind === "request");
    expect(pages.length).toBe(Math.ceil(items.length / 2));
    expect(pages.at(-1)?.note).toMatch(/sync token$/);
  });

  test("backs off and retries a rate-limited request", async () => {
    const { api, google } = setup();
    google.rateLimitNext(2);
    await expect(api.list(between(monday))).resolves.toMatchObject({ items: expect.any(Array) });
    expect(requests(google).slice(0, 3)).toEqual([
      "GET events 429",
      "GET events 429",
      "GET events 200",
    ]);
  });

  test("gives up after its retries", async () => {
    const google = createFakeGoogleCalendar({ events: [], timeZone });
    const api = createGoogleCalendarApi({
      baseUrl: fakeGoogleBaseUrl,
      fetch: google.fetch,
      retries: 1,
      retryDelay: () => 0,
    });
    google.rateLimitNext(2);
    await expect(api.list(between(monday))).rejects.toMatchObject({
      reason: "rateLimitExceeded",
      status: 429,
    });
  });

  test("writes with If-Match, and Google refuses a stale etag with 412", async () => {
    const { api } = setup();
    const { items } = await api.list(between(monday));
    const review = items.find((item) => item.id === "review")!;
    const moved = await api.patch("review", { summary: "Design review (moved)" }, review.etag);
    expect(moved.etag).not.toBe(review.etag);
    const stale = api.patch("review", { summary: "Mine" }, review.etag);
    await expect(stale).rejects.toBeInstanceOf(GoogleApiError);
    await expect(stale).rejects.toMatchObject({ reason: "conditionNotMet", status: 412 });
  });
});

describe("toGoogleTimes", () => {
  test("writes all-day events as dates, with the exclusive end, and clears the times", () => {
    const start = Temporal.PlainDate.from("2026-10-21");
    expect(
      toGoogleTimes({ end: start.add({ days: 2 }), kind: "all-day", start }, timeZone),
    ).toEqual({
      end: { date: "2026-10-23", dateTime: null },
      start: { date: "2026-10-21", dateTime: null },
    });
  });

  test("writes timed events on their own zone's clock, and clears the date", () => {
    const start = Temporal.Instant.from("2026-10-20T09:00:00Z");
    const times = toGoogleTimes(
      { end: start.add({ hours: 1 }), kind: "timed", sourceTimeZone: "America/New_York", start },
      timeZone,
    );
    expect(times.start).toEqual({
      date: null,
      dateTime: "2026-10-20T05:00:00-04:00",
      timeZone: "America/New_York",
    });
    expect(
      toGoogleTimes({ end: start.add({ hours: 1 }), kind: "timed", start }, timeZone).end,
    ).toEqual({ date: null, dateTime: "2026-10-20T12:00:00+02:00", timeZone });
  });
});

describe("the sync store", () => {
  test("loads the dates on screen once, and series as their masters", async () => {
    const { google, sync } = setup();
    await sync.load(week(monday));
    expect(titles(sync)).toEqual(thisWeek);

    // The same week again needs no request; the next one asks only for its own dates.
    const before = requests(google).length;
    await sync.load(week(monday));
    expect(requests(google).length).toBe(before);
    await sync.load(week(monday.add({ days: 7 })));
    expect(titles(sync, monday.add({ days: 7 }))).toContain("2026-10-21 Team offsite");
    expect(titles(sync, monday.add({ days: 7 }))).toContain("2026-10-20T12:00:00 Quarterly review");
  });

  test("applies changes made in Google with the sync token", async () => {
    const { google, sync } = setup();
    await sync.load(week(monday));
    google.changeElsewhere(
      "renamed",
      (events) => ({ ...events.get("review")!, summary: "Design crit" }),
      false,
    );
    google.changeElsewhere(
      "cancelled",
      () => ({
        id: instanceId("standup", at("2026-10-16", "09:00")),
        originalStartTime: { dateTime: "2026-10-16T09:00:00+02:00", timeZone },
        recurringEventId: "standup",
        status: "cancelled",
      }),
      false,
    );
    google.changeElsewhere(
      "deleted",
      (events) => ({ ...events.get("focustime")!, status: "cancelled" }),
      false,
    );
    await sync.sync();
    expect(requests(google).at(-1)).toBe("GET events 200");
    const shownTitles = titles(sync);
    expect(shownTitles).toContain("2026-10-14T11:30:00 Design crit");
    expect(shownTitles).not.toContain("2026-10-16T09:00:00 Stand-up");
    expect(shownTitles.some((title) => title.endsWith("Focus time"))).toBe(false);
  });

  test("starts again when the sync token has expired", async () => {
    const { google, sync } = setup();
    await sync.load(week(monday));
    google.expireSyncTokens();
    await sync.sync();
    // The 410, then the week's pages again.
    const log = requests(google);
    const gone = log.lastIndexOf("GET events 410");
    expect(gone).toBeGreaterThan(0);
    expect(log.slice(gone + 1)).toEqual(log.slice(0, gone).filter((line) => line.endsWith("200")));
    expect(titles(sync)).toEqual(thisWeek);
    await sync.sync();
    expect(requests(google).at(-1)).toBe("GET events 200");
  });
});

describe("saving changes", () => {
  test("moves a one-off event with its etag", async () => {
    const { google, sync } = setup();
    await sync.load(week(monday));
    await save(sync, move(find(sync, "review"), at("2026-10-14", "15:00")), "this");
    expect(google.getEvent("review")?.start).toEqual({
      dateTime: "2026-10-14T15:00:00+02:00",
      timeZone,
    });
    expect(titles(sync)).toContain("2026-10-14T15:00:00 Design review");
  });

  test("rolls back a change that conflicts with one made in Google, and shows Google's", async () => {
    const { google, sync } = setup();
    await sync.load(week(monday));
    google.changeElsewhere(
      "renamed",
      (events) => ({ ...events.get("review")!, summary: "Design crit" }),
      false,
    );
    const saving = save(sync, move(find(sync, "review"), at("2026-10-14", "15:00")), "this");
    await expect(saving).rejects.toMatchObject({ status: 412 });
    expect(titles(sync)).toContain("2026-10-14T11:30:00 Design crit");
  });

  test("moves one occurrence by patching its instance", async () => {
    const { google, sync } = setup();
    await sync.load(week(monday));
    const tuesday = find(sync, "standup::2026-10-13T07:00:00Z");
    await save(sync, move(tuesday, at("2026-10-13", "14:00")), "this");
    expect(google.getEvent(instanceId("standup", at("2026-10-13", "09:00")))).toMatchObject({
      originalStartTime: { dateTime: "2026-10-13T09:00:00+02:00" },
      recurringEventId: "standup",
      start: { dateTime: "2026-10-13T14:00:00+02:00" },
    });
    expect(titles(sync)).toContain("2026-10-13T14:00:00 Stand-up");
    expect(google.getEvent("standup")?.recurrence).toEqual([
      "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
    ]);
  });

  test("deletes one occurrence by cancelling its instance, and leaves the master", async () => {
    const { google, sync } = setup();
    await sync.load(week(monday));
    const master = google.getEvent("standup");
    await save(sync, remove(find(sync, "standup::2026-10-12T07:00:00Z")), "this");
    expect(google.getEvent(instanceId("standup", at("2026-10-12", "09:00")))?.status).toBe(
      "cancelled",
    );
    expect(google.getEvent("standup")).toBe(master);
    expect(titles(sync)).not.toContain("2026-10-12T09:00:00 Stand-up");
  });

  test("moves all occurrences, and keeps the changed and cancelled ones", async () => {
    const { google, sync } = setup();
    await sync.load(week(monday));
    const tuesday = find(sync, "standup::2026-10-13T07:00:00Z");
    await save(sync, move(tuesday, at("2026-10-13", "09:30")), "all");
    expect(google.getEvent("standup")?.start?.dateTime).toBe("2026-10-05T09:30:00+02:00");
    expect(titles(sync).filter((title) => title.includes("Stand-up"))).toEqual([
      "2026-10-12T09:30:00 Stand-up",
      "2026-10-13T09:30:00 Stand-up",
      // Thursday's stays where it was moved, and Wednesday's stays cancelled.
      "2026-10-15T10:00:00 Stand-up (late)",
      "2026-10-16T09:30:00 Stand-up",
    ]);
  });

  test("splits the series for this and following occurrences", async () => {
    const { google, sync } = setup();
    await sync.load(week(monday));
    const tuesday = find(sync, "standup::2026-10-13T07:00:00Z");
    await save(sync, move(tuesday, at("2026-10-13", "08:00")), "following");
    expect(google.getEvent("standup")?.recurrence?.[0]).toMatch(/^RRULE:.*UNTIL=/);
    expect(google.getEvent("standup2")).toMatchObject({
      recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"],
      start: { dateTime: "2026-10-13T08:00:00+02:00" },
      summary: "Stand-up",
    });
    expect(titles(sync).filter((title) => title.includes("Stand-up"))).toEqual([
      "2026-10-12T09:00:00 Stand-up",
      "2026-10-13T08:00:00 Stand-up",
      "2026-10-15T10:00:00 Stand-up (late)",
      "2026-10-16T08:00:00 Stand-up",
    ]);
  });

  test("deletes a whole series", async () => {
    const { google, sync } = setup();
    await sync.load(week(monday));
    await save(sync, remove(find(sync, "standup::2026-10-13T07:00:00Z")), "all");
    expect(google.getEvent("standup")?.status).toBe("cancelled");
    expect(titles(sync).some((title) => title.includes("Stand-up"))).toBe(false);
  });

  test("creates events with an ID Google accepts", async () => {
    const { sync } = setup();
    await sync.load(week(monday));
    const start = at("2026-10-14", "16:00").toInstant();
    const edit = resolveRecurrenceEdit(
      {
        cause: "create",
        event: null,
        eventId: null,
        id: "change",
        original: null,
        proposed: { end: start.add({ hours: 1 }), kind: "timed", resourceIds: [], start },
      },
      "this",
      adapters,
    );
    if (edit.type === "rejected") throw new Error(edit.message);
    await sync.save(edit, timeZone);
    expect(titles(sync)).toContain("2026-10-14T16:00:00 New event");
  });
});
