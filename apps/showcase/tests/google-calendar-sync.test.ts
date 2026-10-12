import type { CalendarEventChange, CalendarEventInterval } from "@moltenship/calendar";
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
import type { GoogleEvent } from "../content/examples/google-calendar";
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

function setup({ pageSize = 4, retries = 5 } = {}) {
  const google = createFakeGoogleCalendar({ events: createSeedEvents(now), pageSize, timeZone });
  const api = createGoogleCalendarApi({
    baseUrl: fakeGoogleBaseUrl,
    fetch: google.fetch,
    retries,
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

/**
 * Each occurrence that starts in the week from `start`, as its title and start on the Berlin
 * clock. The expander passes one-off events through whatever their dates.
 */
function titles(sync: GoogleCalendarSync, start = monday) {
  return shown(sync, start)
    .flatMap(({ event, interval }) => {
      const when =
        interval.kind === "timed"
          ? interval.start.toZonedDateTimeISO(timeZone).toPlainDateTime()
          : interval.start;
      const date = Temporal.PlainDate.from(when);
      const inWeek =
        Temporal.PlainDate.compare(start, date) <= 0 &&
        Temporal.PlainDate.compare(date, start.add({ days: 7 })) < 0;
      return inWeek ? [`${when.toString()} ${event.title}`] : [];
    })
    .sort();
}

const requests = (google: ReturnType<typeof setup>["google"]) =>
  google
    .getLog()
    .filter((entry) => entry.kind === "request")
    .map((entry) => `${entry.text.split("?")[0]!.split(" If-Match")[0]} ${entry.status}`);

/** A drag of `occurrence` to `proposed`, as the calendar hands it to `onEventChange`. */
function moveTo(occurrence: GoogleOccurrence, proposed: CalendarEventInterval) {
  return {
    cause: "move",
    event: occurrence,
    eventId: occurrence.id,
    id: "change",
    original: { ...occurrence.interval, resourceIds: [] },
    proposed: { ...proposed, resourceIds: [] },
  } satisfies CalendarEventChange<GoogleOccurrence, string, string>;
}

/** A drag of a timed `occurrence` to `start`, keeping its length. */
function move(occurrence: GoogleOccurrence, start: Temporal.ZonedDateTime) {
  const { interval } = occurrence;
  if (interval.kind !== "timed") throw new Error("Timed occurrences only");
  const end = start.toInstant().add(interval.start.until(interval.end));
  return moveTo(occurrence, { end, kind: "timed", start: start.toInstant() });
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
    occurrences: shown(sync, monday.subtract({ days: 7 })).concat(shown(sync)),
    timeZone,
  });
  if (edit.type === "rejected") throw new Error(edit.message);
  await sync.save(edit, timeZone);
}

function find(sync: GoogleCalendarSync, id: string, start = monday) {
  const found = shown(sync, start).find((occurrence) => occurrence.id === id);
  if (found === undefined) throw new Error(`${id} isn't shown`);
  return found;
}

/** A change made in Google by someone else, with no push notification. */
function elsewhere(
  google: ReturnType<typeof setup>["google"],
  change: (events: ReadonlyMap<string, GoogleEvent>) => GoogleEvent,
) {
  google.changeElsewhere("elsewhere", change, false);
}

/** An exception of the seed's stand-up: the occurrence at `date` 09:00, moved and changed. */
function exception(date: string, fields: Partial<GoogleEvent>): GoogleEvent {
  const key = at(date, "09:00");
  return {
    colorId: "7",
    end: { dateTime: "", timeZone },
    id: instanceId("standup", key),
    originalStartTime: { dateTime: key.toString({ timeZoneName: "never" }), timeZone },
    recurringEventId: "standup",
    start: { dateTime: "", timeZone },
    status: "confirmed",
    summary: "Stand-up",
    ...fields,
  };
}

const time = (date: string, clock: string) => ({
  dateTime: at(date, clock).toString({ timeZoneName: "never" }),
  timeZone,
});

const standups = (sync: GoogleCalendarSync, start = monday) =>
  titles(sync, start).filter((title) => title.includes("Stand-up"));

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
    const { api, google } = setup({ retries: 1 });
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
  test("syncs from the first date on screen, and loads earlier dates between two bounds", async () => {
    const { google, sync } = setup();
    await sync.load(week(monday));
    expect(titles(sync)).toEqual(thisWeek);
    const first = google.getLog().filter((entry) => entry.kind === "request");
    expect(first[0]?.text).toMatch(/^GET events\?timeMin=[^&]+$/);
    expect(first.at(-1)?.note).toMatch(/sync token$/);

    // Later dates are in the store already; the same week again needs nothing either.
    const before = requests(google).length;
    await sync.load(week(monday.add({ days: 7 })));
    await sync.load(week(monday));
    expect(requests(google).length).toBe(before);
    expect(titles(sync, monday.add({ days: 7 }))).toContain("2026-10-21 Team offsite");

    // An earlier week loads once, with both bounds.
    await sync.load(week(monday.subtract({ days: 7 })));
    const earlier = google
      .getLog()
      .filter((entry) => entry.kind === "request")
      .slice(before);
    expect(earlier[0]?.text).toMatch(/^GET events\?timeMin=.+&timeMax=/);
    expect(titles(sync, monday.subtract({ days: 7 }))).toContain(
      "2026-10-08T11:00:00 Sprint retro",
    );
  });

  test("applies changes made in Google with the sync token", async () => {
    const { google, sync } = setup();
    await sync.load(week(monday));
    elsewhere(google, (events) => ({ ...events.get("review")!, summary: "Design crit" }));
    elsewhere(google, () => exception("2026-10-16", { status: "cancelled" }));
    elsewhere(google, (events) => ({ ...events.get("focustime")!, status: "cancelled" }));
    await sync.sync();
    expect(requests(google).at(-1)).toBe("GET events 200");
    const shownTitles = titles(sync);
    expect(shownTitles).toContain("2026-10-14T11:30:00 Design crit");
    expect(shownTitles).not.toContain("2026-10-16T09:00:00 Stand-up");
    expect(shownTitles.some((title) => title.endsWith("Focus time"))).toBe(false);
  });

  test("keeps the first token, so changes between two lists aren't skipped", async () => {
    const { google, sync } = setup();
    await sync.load(week(monday));
    elsewhere(google, (events) => ({ ...events.get("review")!, summary: "Design crit" }));
    // This list returns a newer token; the store keeps syncing from the first.
    await sync.load(week(monday.subtract({ days: 7 })));
    await sync.sync();
    expect(titles(sync)).toContain("2026-10-14T11:30:00 Design crit");
  });

  test("syncs again from scratch when the sync token has expired", async () => {
    const { google, sync } = setup();
    await sync.load(week(monday));
    google.expireSyncTokens();
    await sync.sync();
    const log = requests(google);
    const gone = log.lastIndexOf("GET events 410");
    expect(gone).toBeGreaterThan(0);
    expect(log.slice(gone + 1)).toEqual(log.slice(0, gone).filter((line) => line.endsWith("200")));
    expect(titles(sync)).toEqual(thisWeek);
    await sync.sync();
    expect(requests(google).at(-1)).toBe("GET events 200");
  });

  test("keeps its events when the full sync after a 410 fails, and tries again", async () => {
    const google = createFakeGoogleCalendar({ events: createSeedEvents(now), timeZone });
    let failFullSync = false;
    const api = createGoogleCalendarApi({
      baseUrl: fakeGoogleBaseUrl,
      // The full sync's list fails while `failFullSync` is set, as a network error would.
      fetch: (input, init) =>
        failFullSync && new Request(input).url.includes("timeMin=")
          ? Promise.reject(new TypeError("Failed to fetch"))
          : google.fetch(input, init),
      retryDelay: () => 0,
    });
    const sync = createGoogleCalendarSync(api);
    await sync.load(week(monday));
    const events = sync.getEvents();

    google.expireSyncTokens();
    failFullSync = true;
    await expect(sync.sync()).rejects.toThrow("Failed to fetch");
    expect(sync.getEvents()).toBe(events);

    failFullSync = false;
    await sync.sync();
    expect(titles(sync)).toEqual(thisWeek);
    expect(sync.getEvents()).not.toBe(events);
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

  test("moves a timed event to the all-day row, clearing its time", async () => {
    const { google, sync } = setup();
    await sync.load(week(monday));
    const date = Temporal.PlainDate.from("2026-10-14");
    await save(
      sync,
      moveTo(find(sync, "review"), { end: date.add({ days: 1 }), kind: "all-day", start: date }),
      "this",
    );
    expect(google.getEvent("review")?.start).toEqual({ date: "2026-10-14", timeZone });
    expect(titles(sync)).toContain("2026-10-14 Design review");
  });

  test("rolls back a change that conflicts with one made in Google, and shows Google's", async () => {
    const { google, sync } = setup();
    await sync.load(week(monday));
    elsewhere(google, (events) => ({ ...events.get("review")!, summary: "Design crit" }));
    const saving = save(sync, move(find(sync, "review"), at("2026-10-14", "15:00")), "this");
    await expect(saving).rejects.toMatchObject({ status: 412 });
    expect(titles(sync)).toContain("2026-10-14T11:30:00 Design crit");
  });

  test("deletes an event someone already deleted without an error", async () => {
    const { google, sync } = setup();
    await sync.load(week(monday));
    elsewhere(google, (events) => ({ ...events.get("review")!, status: "cancelled" }));
    await save(sync, remove(find(sync, "review")), "this");
    expect(requests(google)).toContain("DELETE events/review 410");
    expect(titles(sync).some((title) => title.endsWith("Design review"))).toBe(false);
  });

  test("moves one occurrence by writing its instance", async () => {
    const { google, sync } = setup();
    await sync.load(week(monday));
    const tuesday = find(sync, "standup::2026-10-13T07:00:00Z");
    await save(sync, move(tuesday, at("2026-10-13", "14:00")), "this");
    expect(google.getEvent(instanceId("standup", at("2026-10-13", "09:00")))).toMatchObject({
      colorId: "7",
      originalStartTime: { dateTime: "2026-10-13T09:00:00+02:00" },
      recurringEventId: "standup",
      start: { dateTime: "2026-10-13T14:00:00+02:00" },
      summary: "Stand-up",
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
    expect(standups(sync)).toEqual([
      "2026-10-12T09:30:00 Stand-up",
      "2026-10-13T09:30:00 Stand-up",
      // Thursday's stays where it was moved, and Wednesday's stays cancelled.
      "2026-10-15T10:00:00 Stand-up (late)",
      "2026-10-16T09:30:00 Stand-up",
    ]);
  });

  test("moving a changed occurrence for all events keeps it, and the slot it leaves", async () => {
    const { google, sync } = setup();
    await sync.load(week(monday));
    // Thursday's late stand-up to Wednesday: the series moves a day earlier, to Sunday–Thursday.
    const late = find(sync, "standup::2026-10-15T07:00:00Z");
    await save(sync, move(late, at("2026-10-14", "10:00")), "all");
    expect(google.getEvent("standup")?.recurrence).toEqual([
      "RRULE:FREQ=WEEKLY;BYDAY=SU,MO,TU,WE,TH",
    ]);
    expect(standups(sync)).toEqual([
      "2026-10-12T09:00:00 Stand-up",
      // Tuesday is the cancelled Wednesday, a day earlier.
      "2026-10-14T10:00:00 Stand-up (late)",
      // The series still has Thursday, so the late one's old instance shows as the series has it.
      "2026-10-15T09:00:00 Stand-up",
      "2026-10-18T09:00:00 Stand-up",
    ]);
  });

  test("an occurrence moved onto another's instance takes nothing of it", async () => {
    const { google, sync } = setup();
    elsewhere(google, () =>
      exception("2026-10-12", {
        end: time("2026-10-12", "13:30"),
        start: time("2026-10-12", "13:00"),
        summary: "Stand-up A",
      }),
    );
    elsewhere(google, () =>
      exception("2026-10-13", {
        colorId: "11",
        end: time("2026-10-13", "14:30"),
        start: time("2026-10-13", "14:00"),
        summary: "Stand-up B",
        transparency: "transparent",
      }),
    );
    await sync.load(week(monday));
    // Friday to Saturday: every original start moves a day later, onto the next one's.
    const friday = find(sync, "standup::2026-10-16T07:00:00Z");
    await save(sync, move(friday, at("2026-10-17", "09:00")), "all");
    expect(standups(sync)).toEqual([
      "2026-10-12T13:00:00 Stand-up A",
      "2026-10-13T14:00:00 Stand-up B",
      "2026-10-15T10:00:00 Stand-up (late)",
      "2026-10-17T09:00:00 Stand-up",
    ]);
    const a = google.getEvent(instanceId("standup", at("2026-10-13", "09:00")));
    expect(a).toMatchObject({ colorId: "7", summary: "Stand-up A" });
    expect(a?.transparency).toBeUndefined();
  });

  test("splits the series for this and following occurrences", async () => {
    const { google, sync } = setup();
    await sync.load(week(monday));
    const tuesday = find(sync, "standup::2026-10-13T07:00:00Z");
    await save(sync, move(tuesday, at("2026-10-13", "08:00")), "following");
    expect(google.getEvent("standup")?.recurrence?.[0]).toMatch(/^RRULE:.*UNTIL=/);
    expect(google.getEvent("standup2")).toMatchObject({
      colorId: "7",
      recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"],
      start: { dateTime: "2026-10-13T08:00:00+02:00" },
      summary: "Stand-up",
    });
    expect(standups(sync)).toEqual([
      "2026-10-12T09:00:00 Stand-up",
      "2026-10-13T08:00:00 Stand-up",
      "2026-10-15T10:00:00 Stand-up (late)",
      "2026-10-16T08:00:00 Stand-up",
    ]);
  });

  test("a changed occurrence keeps its title when it starts the new series", async () => {
    const { google, sync } = setup();
    await sync.load(week(monday));
    const late = find(sync, "standup::2026-10-15T07:00:00Z");
    await save(sync, move(late, at("2026-10-15", "11:00")), "following");
    expect(standups(sync)).toEqual([
      "2026-10-12T09:00:00 Stand-up",
      "2026-10-13T09:00:00 Stand-up",
      "2026-10-15T11:00:00 Stand-up (late)",
      "2026-10-16T10:00:00 Stand-up",
    ]);
    // The old series' late one is cancelled: its occurrence left the series.
    expect(google.getEvent(instanceId("standup", at("2026-10-15", "09:00")))?.status).toBe(
      "cancelled",
    );
  });

  test("ends the series for this and following deletes", async () => {
    const { sync } = setup();
    await sync.load(week(monday));
    await save(sync, remove(find(sync, "standup::2026-10-13T07:00:00Z")), "following");
    expect(standups(sync)).toEqual(["2026-10-12T09:00:00 Stand-up"]);
    expect(standups(sync, monday.add({ days: 7 }))).toEqual([]);
  });

  test("moves an all-day series by its dates", async () => {
    const { google, sync } = setup();
    await sync.load(week(monday));
    const friday = find(sync, "release::2026-10-16");
    const thursday = Temporal.PlainDate.from("2026-10-15");
    await save(
      sync,
      moveTo(friday, { end: thursday.add({ days: 1 }), kind: "all-day", start: thursday }),
      "all",
    );
    expect(google.getEvent("release")).toMatchObject({
      end: { date: "2026-10-09" },
      start: { date: "2026-10-08" },
    });
    expect(titles(sync)).toContain("2026-10-15 Release day");
  });

  test("deletes a whole series", async () => {
    const { google, sync } = setup();
    await sync.load(week(monday));
    await save(sync, remove(find(sync, "standup::2026-10-13T07:00:00Z")), "all");
    expect(google.getEvent("standup")?.status).toBe("cancelled");
    expect(standups(sync)).toEqual([]);
  });

  test("refuses to rewrite a series with lines it can't write back", async () => {
    const { google, sync } = setup();
    elsewhere(google, (events) => ({
      ...events.get("standup")!,
      recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", "EXRULE:FREQ=MONTHLY"],
    }));
    await sync.load(week(monday));
    const tuesday = find(sync, "standup::2026-10-13T07:00:00Z");
    const before = requests(google).length;
    await expect(save(sync, move(tuesday, at("2026-10-13", "09:30")), "all")).rejects.toThrow(
      "can't write back",
    );
    // Syncs, but writes nothing.
    expect(
      requests(google)
        .slice(before)
        .every((line) => line.startsWith("GET")),
    ).toBe(true);

    // Deleting one occurrence doesn't touch the master, so it works.
    await save(sync, remove(find(sync, "standup::2026-10-13T07:00:00Z")), "this");
    expect(standups(sync)).not.toContain("2026-10-13T09:00:00 Stand-up");
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

describe("changes made in Google meanwhile", () => {
  test("a failed first load is tried again by the next sync", async () => {
    const { google, sync } = setup({ retries: 0 });
    google.rateLimitNext(1);
    await expect(sync.load(week(monday))).rejects.toMatchObject({ status: 429 });
    expect(sync.getEvents()).toEqual([]);
    await sync.sync();
    expect(titles(sync)).toEqual(thisWeek);
  });

  test("moving an occurrence someone cancelled rolls back, and doesn't bring it back", async () => {
    const { google, sync } = setup();
    await sync.load(week(monday));
    elsewhere(google, () => exception("2026-10-16", { status: "cancelled" }));
    const friday = find(sync, "standup::2026-10-16T07:00:00Z");
    await expect(save(sync, move(friday, at("2026-10-16", "14:00")), "this")).rejects.toMatchObject(
      { status: 410 },
    );
    expect(google.getEvent(instanceId("standup", at("2026-10-16", "09:00")))?.status).toBe(
      "cancelled",
    );
    expect(standups(sync)).not.toContain("2026-10-16T09:00:00 Stand-up");
  });

  test("deleting an occurrence someone cancelled is done", async () => {
    const { google, sync } = setup();
    await sync.load(week(monday));
    elsewhere(google, () => exception("2026-10-16", { status: "cancelled" }));
    const before = requests(google).length;
    await save(sync, remove(find(sync, "standup::2026-10-16T07:00:00Z")), "this");
    expect(
      requests(google)
        .slice(before)
        .every((line) => line.startsWith("GET")),
    ).toBe(true);
    expect(standups(sync)).not.toContain("2026-10-16T09:00:00 Stand-up");
  });

  test("deleting an occurrence the series no longer has rolls back", async () => {
    const { google, sync } = setup();
    await sync.load(week(monday));
    const friday = find(sync, "standup::2026-10-16T07:00:00Z");
    // Someone moves the whole series an hour later in Google.
    elsewhere(google, (events) => ({
      ...events.get("standup")!,
      end: time("2026-10-05", "10:30"),
      start: time("2026-10-05", "10:00"),
    }));
    await expect(save(sync, remove(friday), "this")).rejects.toMatchObject({ status: 404 });
    expect(standups(sync)).toContain("2026-10-16T10:00:00 Stand-up");
  });

  test("a change the store learned of while the user decided still stops the edit", async () => {
    const { google, sync } = setup();
    await sync.load(week(monday));
    // The user drags these as they are now; then a sync brings in Ana's changes.
    const friday = find(sync, "standup::2026-10-16T07:00:00Z");
    const late = find(sync, "standup::2026-10-15T07:00:00Z");
    const lateId = instanceId("standup", at("2026-10-15", "09:00"));
    elsewhere(google, () =>
      exception("2026-10-16", {
        end: time("2026-10-16", "13:30"),
        start: time("2026-10-16", "13:00"),
        summary: "Stand-up (Ana's)",
      }),
    );
    elsewhere(google, (events) => ({ ...events.get(lateId)!, summary: "Stand-up (Ana's late)" }));
    await sync.sync();
    await expect(save(sync, move(friday, at("2026-10-16", "15:00")), "this")).rejects.toMatchObject(
      { status: 412 },
    );
    await expect(
      save(sync, move(late, at("2026-10-15", "11:00")), "following"),
    ).rejects.toMatchObject({ status: 412 });
    expect(standups(sync)).toContain("2026-10-16T13:00:00 Stand-up (Ana's)");
    expect(standups(sync)).toContain("2026-10-15T10:00:00 Stand-up (Ana's late)");
  });

  test.each(["following", "all"] as const)(
    "an occurrence changed while the user decided stops %s edits of it",
    async (scope) => {
      const { google, sync } = setup();
      await sync.load(week(monday));
      const friday = find(sync, "standup::2026-10-16T07:00:00Z");
      elsewhere(google, () =>
        exception("2026-10-16", {
          end: time("2026-10-16", "13:30"),
          start: time("2026-10-16", "13:00"),
          summary: "Stand-up (Ana's)",
        }),
      );
      await sync.sync();
      const master = google.getEvent("standup");
      await expect(
        save(sync, move(friday, at("2026-10-16", "10:00")), scope),
      ).rejects.toMatchObject({ status: 412 });
      expect(google.getEvent("standup")).toBe(master);
      expect(google.getEvent("standup2")).toBeUndefined();
    },
  );

  test("moving an occurrence someone moved rolls back onto theirs", async () => {
    const { google, sync } = setup();
    await sync.load(week(monday));
    elsewhere(google, () =>
      exception("2026-10-16", {
        end: time("2026-10-16", "13:30"),
        start: time("2026-10-16", "13:00"),
        summary: "Stand-up (Ana's)",
      }),
    );
    const friday = find(sync, "standup::2026-10-16T07:00:00Z");
    await expect(save(sync, move(friday, at("2026-10-16", "15:00")), "this")).rejects.toMatchObject(
      { status: 412 },
    );
    expect(standups(sync)).toContain("2026-10-16T13:00:00 Stand-up (Ana's)");
  });

  test("moving a changed occurrence someone renamed stops before writing", async () => {
    const { google, sync } = setup();
    await sync.load(week(monday));
    const lateId = instanceId("standup", at("2026-10-15", "09:00"));
    elsewhere(google, (events) => ({ ...events.get(lateId)!, summary: "Stand-up (Ana's)" }));
    const late = find(sync, "standup::2026-10-15T07:00:00Z");
    await expect(
      save(sync, move(late, at("2026-10-15", "11:00")), "following"),
    ).rejects.toMatchObject({ status: 412 });
    expect(google.getEvent("standup2")).toBeUndefined();
    expect(standups(sync)).toContain("2026-10-15T10:00:00 Stand-up (Ana's)");
  });

  test("a series edit stops if a changed occurrence appeared in Google", async () => {
    const { google, sync } = setup();
    await sync.load(week(monday));
    elsewhere(google, () => exception("2026-10-16", { status: "cancelled" }));
    const master = google.getEvent("standup");
    const tuesday = find(sync, "standup::2026-10-13T07:00:00Z");
    await expect(save(sync, move(tuesday, at("2026-10-13", "09:30")), "all")).rejects.toMatchObject(
      { status: 412 },
    );
    expect(google.getEvent("standup")).toBe(master);
    expect(standups(sync)).not.toContain("2026-10-16T09:00:00 Stand-up");
  });

  test("a series edit right after the sync token expired goes through", async () => {
    const { google, sync } = setup();
    await sync.load(week(monday));
    google.expireSyncTokens();
    const tuesday = find(sync, "standup::2026-10-13T07:00:00Z");
    await save(sync, move(tuesday, at("2026-10-13", "09:30")), "all");
    expect(standups(sync)).toContain("2026-10-13T09:30:00 Stand-up");
  });

  test("a series edit stops before writing if one of its changed occurrences changed", async () => {
    const { google, sync } = setup();
    await sync.load(week(monday));
    const lateId = instanceId("standup", at("2026-10-15", "09:00"));
    elsewhere(google, (events) => ({ ...events.get(lateId)!, summary: "Stand-up (Ana's)" }));
    const master = google.getEvent("standup");
    const tuesday = find(sync, "standup::2026-10-13T07:00:00Z");
    await expect(save(sync, move(tuesday, at("2026-10-13", "09:30")), "all")).rejects.toMatchObject(
      { status: 412 },
    );
    expect(google.getEvent("standup")).toBe(master);
    expect(standups(sync)).toContain("2026-10-15T10:00:00 Stand-up (Ana's)");
  });

  test("a change to one occurrence doesn't wait on the series' other changed ones", async () => {
    const { google, sync } = setup();
    await sync.load(week(monday));
    const lateId = instanceId("standup", at("2026-10-15", "09:00"));
    elsewhere(google, (events) => ({ ...events.get(lateId)!, summary: "Stand-up (Ana's)" }));
    const tuesday = find(sync, "standup::2026-10-13T07:00:00Z");
    await save(sync, move(tuesday, at("2026-10-13", "14:00")), "this");
    expect(standups(sync)).toContain("2026-10-13T14:00:00 Stand-up");
  });
});
