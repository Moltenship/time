// #region store
// lib/google-calendar-sync.ts
import type { CalendarEventChange, CalendarEventInterval } from "@moltenship/calendar";
import {
  createCanonicalRecurrenceAdapter,
  createOccurrenceExpander,
  recurrenceOverrideEdit,
  type RecurrenceDate,
  type RecurrenceEdit,
  type RecurrenceSeriesEdit,
} from "@moltenship/calendar-recurrence";

import {
  fromGoogleEvents,
  readGoogleRecurrence,
  toGoogleRecurrence,
  type GoogleCalendarEvent,
  type GoogleEvent,
} from "./google-calendar";
import {
  GoogleApiError,
  type GoogleCalendarApi,
  type GoogleEventWrite,
} from "./google-calendar-api";

/** Instants to load events for, half-open, as `onVisibleRangeChange`'s `loadInstantRange`. */
export interface TimeRange {
  readonly end: Temporal.Instant;
  readonly start: Temporal.Instant;
}

/** What `resolveRecurrenceEdit` returns for a change it accepted. */
export type GoogleEdit = Exclude<
  RecurrenceEdit<GoogleCalendarEvent, string, string>,
  { type: "rejected" }
>;

export interface GoogleCalendarSync {
  /** The events loaded so far, for the expander: the same array until one changes. */
  readonly getEvents: () => readonly GoogleCalendarEvent[];
  /** Calls `listener` whenever the events change, and returns a function that stops it. */
  readonly subscribe: (listener: () => void) => () => void;
  /** Loads the events `range` needs that aren't loaded yet. */
  readonly load: (range: TimeRange) => Promise<void>;
  /** Applies every change since the last sync, or syncs again from scratch after a 410. */
  readonly sync: () => Promise<void>;
  /** Writes an edit to Google, then syncs. Throws, after the sync, if Google refused a write. */
  readonly save: (edit: GoogleEdit, timeZone: string) => Promise<void>;
}

const day = { hours: 24 };

export function createGoogleCalendarSync(api: GoogleCalendarApi): GoogleCalendarSync {
  /** Google's events by ID: masters, changed and cancelled occurrences, one-off events. */
  const stored = new Map<string, GoogleEvent>();
  const mapped = new WeakMap<GoogleEvent, GoogleCalendarEvent | null>();
  const listeners = new Set<() => void>();
  let events: readonly GoogleCalendarEvent[] = [];
  /** The sync covers every event from here on. */
  let syncedFrom: Temporal.Instant | undefined;
  /** Dates before `syncedFrom` loaded since, sorted and apart. */
  let earlier: TimeRange[] = [];
  let lastRange: TimeRange | undefined;
  let syncToken: string | undefined;

  // One request chain at a time, so an older answer never overwrites a newer one.
  let queue: Promise<unknown> = Promise.resolve();
  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  }

  function changed() {
    // Each Google event maps once, so the expander reuses its work for the ones that didn't change.
    const next = [...stored.values()].flatMap((item) => {
      if (!mapped.has(item)) {
        const { events: mappedEvents, problems } = fromGoogleEvents([item]);
        for (const problem of problems) console.warn(`Google Calendar: ${problem}`);
        mapped.set(item, mappedEvents[0] ?? null);
      }
      return mapped.get(item) ?? [];
    });
    if (next.length === events.length && next.every((event, index) => event === events[index])) {
      return;
    }
    events = next;
    for (const listener of listeners) listener();
  }

  /** Google's answer, by ID. A cancelled occurrence stays, since it hides that occurrence. */
  function apply(items: readonly GoogleEvent[]) {
    const deleted = new Set<string>();
    for (const item of items) {
      if (item.recurringEventId !== undefined && deleted.has(item.recurringEventId)) continue;
      if (item.status !== "cancelled" || item.recurringEventId !== undefined) {
        stored.set(item.id, item);
        continue;
      }
      stored.delete(item.id);
      // A deleted series takes its changed and cancelled occurrences with it, in this answer too.
      deleted.add(item.id);
      for (const [id, other] of stored) if (other.recurringEventId === item.id) stored.delete(id);
    }
  }
  /** The etags of a series' master and changed occurrences, or of one occurrence's, by ID. */
  function versions(seriesId: string, recurrenceId?: RecurrenceDate) {
    const found = new Map<string, string | undefined>();
    for (const { data, override } of events) {
      const inSeries = data.id === seriesId || override?.seriesId === seriesId;
      const at =
        recurrenceId === undefined ||
        (override !== undefined &&
          keyOf(override.seriesId, override.recurrenceId) === keyOf(seriesId, recurrenceId));
      if (inSeries && at) found.set(data.id, data.etag);
    }
    return found;
  }
  // #endregion store

  // #region load
  /**
   * The full sync, as Google's sync guide does it: every event that ends after the first date on
   * screen, with no `timeMax`, and the token that syncs them from then on.
   */
  async function fullSync(range: TimeRange) {
    // All-day events are dates on the Google calendar's own clock, which may not be the one on
    // screen, so lists reach a day further.
    const { items, nextSyncToken } = await api.list({ timeMin: range.start.subtract(day) });
    // Swapped in once the list has worked, so a failure leaves the store as it was.
    stored.clear();
    apply(items);
    syncedFrom = range.start;
    earlier = [];
    syncToken = nextSyncToken;
    changed();
  }

  async function loadNow(range: TimeRange) {
    lastRange = range;
    if (syncedFrom === undefined) return fullSync(range);
    // Later dates are in the store already. Earlier ones load once, between two bounds.
    const end = Temporal.Instant.compare(range.end, syncedFrom) < 0 ? range.end : syncedFrom;
    for (const gap of missing(earlier, { end, start: range.start })) {
      const { items } = await api.list({
        timeMax: gap.end.add(day),
        timeMin: gap.start.subtract(day),
      });
      apply(items);
      earlier = merged(earlier, gap);
      changed();
    }
  }
  // #endregion load

  // #region sync
  async function syncNow() {
    if (syncToken === undefined) {
      // The first load failed: try it again.
      if (syncedFrom === undefined && lastRange !== undefined) await fullSync(lastRange);
      return;
    }
    try {
      // Every change since the last sync, whatever its dates.
      const { items, nextSyncToken } = await api.list({ syncToken });
      apply(items);
      syncToken = nextSyncToken ?? syncToken;
      changed();
    } catch (error) {
      // 410 Gone: the token expired. Sync again from scratch, from the dates on screen. Until that
      // works, the old events stay, and the next sync tries again.
      if (!isStatus(error, 410) || lastRange === undefined) throw error;
      await fullSync(lastRange);
    }
  }
  // #endregion sync

  // #region save
  async function saveNow(edit: GoogleEdit, timeZone: string) {
    try {
      if (edit.type === "event") await saveEvent(edit.change, timeZone);
      else await saveSeries(edit, timeZone);
    } finally {
      // Picks up what Google did, such as the newer version a 412 refused to overwrite.
      await syncNow().catch((error: unknown) => console.warn("Google Calendar sync failed", error));
      changed();
    }
  }

  /** A new event, or a change to a one-off event. */
  async function saveEvent(
    change: CalendarEventChange<GoogleCalendarEvent, string, string>,
    timeZone: string,
  ) {
    if (change.cause === "create") {
      const times = toGoogleTimes(change.proposed, timeZone);
      await insert({ id: newGoogleId(), summary: "New event", ...times });
      return;
    }
    // The etag of the version on screen: if someone changed it since, Google answers 412.
    const { data } = change.event;
    if (change.cause === "delete") {
      await remove(data, data.etag);
      return;
    }
    const times = toGoogleTimes(change.proposed, data.start?.timeZone ?? timeZone);
    apply([await api.patch(data.id, times, data.etag)]);
  }

  /** Inserts an event with the ID it names. A 409 means a try whose answer was lost got there. */
  async function insert(event: GoogleEventWrite) {
    try {
      apply([await api.insert(event)]);
    } catch (error) {
      if (!isStatus(error, 409)) throw error;
    }
  }

  /** Deletes an event, which Google keeps as cancelled. One already gone is done. */
  async function remove(event: GoogleEvent, etag: string | undefined) {
    if (event.status === "cancelled") return;
    try {
      await api.remove(event.id, etag);
    } catch (error) {
      if (!isStatus(error, 404, 410)) throw error;
    }
    // Google's answer to a delete has no body, so the cancelled one's etag isn't known.
    apply([{ ...event, etag: undefined, status: "cancelled" }]);
  }
  // #endregion save

  // #region series
  async function saveSeries(
    edit: RecurrenceSeriesEdit<GoogleCalendarEvent, string, string>,
    timeZone: string,
  ) {
    const { newSeries, override, series, seriesId } = edit;
    const zoneOf = (event: GoogleEvent) => event.start?.timeZone ?? timeZone;
    // Google deletes a series' changed and cancelled occurrences with it.
    if (series.action === "delete") {
      await remove(series.event.data, series.event.data.etag);
      return;
    }
    // The writes below replace instances the store read, some without etags. So sync first, and
    // stop if the series changed in Google since the user saw it: the master and the changed
    // occurrences, or for "this", the occurrence's own instance. The edit holds what they saw of
    // the master and the edited occurrence; the store may have newer versions already.
    const only = edit.scope === "this" ? edit.recurrenceId : undefined;
    const edited = override?.action === "create" ? undefined : override?.event;
    const before = versions(seriesId, only);
    if (only !== undefined) before.clear();
    // The edited occurrence as the user saw it: its exception, or none.
    else for (const id of versions(seriesId, edit.recurrenceId).keys()) before.delete(id);
    if (series.action === "update" && only === undefined) {
      before.set(seriesId, series.event.data.etag);
    }
    if (edited !== undefined) before.set(edited.data.id, edited.data.etag);
    await syncNow();
    const after = versions(seriesId, only);
    if (only !== undefined) {
      // Cancelled in Google meanwhile: a delete is done, and a move would bring it back.
      const now = events.find(
        (event) => event.override?.seriesId === seriesId && after.has(event.data.id),
      );
      if (now?.override?.cancelled === true && before.get(now.data.id) !== now.data.etag) {
        if (edit.cause === "delete") return;
        throw new GoogleApiError(410, "deleted", "The occurrence was deleted in Google Calendar.");
      }
    }
    const changedInGoogle = [...after].some(([id, etag]) => {
      if (!before.has(id)) return true;
      // Undefined: cancelled here, and Google's answer to a delete has no etag.
      const seen = before.get(id);
      return seen !== undefined && seen !== etag;
    });
    if (changedInGoogle || (before.has(seriesId) && !after.has(seriesId))) {
      throw new GoogleApiError(412, "conditionNotMet", "The series changed in Google Calendar.");
    }

    // "This event" deletes cancel the occurrence's instance, as Google does, and leave the master.
    if (edit.scope === "this" && edit.cause === "delete") {
      const write: OccurrenceWrite = {
        from: edited,
        placement: "cancel",
        recurrenceId: edit.recurrenceId,
        seriesId,
      };
      await writeOccurrences([write], [], timeZone);
      return;
    }
    // The new `recurrence` is written from what `fromGoogleEvents` read, which would drop the
    // lines it couldn't, such as EXRULE.
    const master = series.action === "update" ? series.event.data : undefined;
    if (master !== undefined && readGoogleRecurrence(master.recurrence ?? []).problems.length > 0) {
      throw new Error("This series has rules the app can't write back. Change it in Google.");
    }
    // The series' other changed and cancelled occurrences, which the edit moves or ends.
    const others = events
      .filter((event) => event.override?.seriesId === seriesId && event.data.id !== edited?.data.id)
      .map((event) => ({ event, next: recurrenceOverrideEdit(edit, event.override!.recurrenceId) }))
      .filter(({ next }) => next.action !== "keep");

    // "This and following events" is Google's split: a new series from the occurrence on, and the
    // old one ended before it. The new one goes first, so a failure leaves the old one whole.
    const newSeriesId = newSeries?.id ?? newGoogleId();
    if (newSeries !== undefined) {
      const zone = zoneOf(newSeries.from.data);
      await insert({
        ...contentOf(newSeries.from.data),
        id: newSeriesId,
        ...toGoogleTimes(newSeries.placement, zone),
        recurrence: toGoogleRecurrence(newSeries.recurrence, zone),
      });
    }
    if (series.action === "update") {
      const zone = zoneOf(series.event.data);
      const fields = {
        ...toGoogleTimes(series.placement, zone),
        recurrence: toGoogleRecurrence(series.recurrence, zone),
      };
      try {
        apply([await api.patch(seriesId, fields, series.event.data.etag)]);
      } catch (error) {
        // With the old series still whole, the new one would repeat it: take it back.
        if (newSeries !== undefined) {
          await remove({ id: newSeriesId }, undefined).catch(() => undefined);
        }
        throw error;
      }
    }

    // The edited occurrence, and the others, which follow the series' new times or end with it.
    const writes: OccurrenceWrite[] = [];
    const left: GoogleCalendarEvent[] = [];
    if (override?.action === "create") {
      writes.push({ placement: override.placement, recurrenceId: override.recurrenceId, seriesId });
    } else if (override?.action === "update") {
      writes.push({
        from: override.event,
        placement: override.cancelled ? "cancel" : override.placement,
        recurrenceId: override.recurrenceId,
        seriesId: override.series === "new" ? newSeriesId : seriesId,
      });
    } else if (override?.action === "delete") {
      left.push(override.event);
    }
    for (const { event, next } of others) {
      if (next.action === "delete") left.push(event);
      if (next.action !== "update") continue;
      writes.push({
        from: event,
        placement: event.override!.cancelled ? "cancel" : event,
        recurrenceId: next.recurrenceId,
        seriesId: next.series === "new" ? newSeriesId : seriesId,
      });
    }
    await writeOccurrences(writes, left, timeZone);
  }

  /**
   * Writes each occurrence to the instance at its series and original start, then clears the
   * instances the moved ones leave. Google names an exception by its series and original start,
   * and neither can change, so an occurrence that moves to another original start is written to
   * the instance there. One may land where another leaves, so every write comes first.
   */
  async function writeOccurrences(
    writes: readonly OccurrenceWrite[],
    left: readonly GoogleCalendarEvent[],
    timeZone: string,
  ) {
    const written = new Set<string>();
    const vacated = [...left];
    for (const { from, placement, recurrenceId, seriesId } of writes) {
      written.add(keyOf(seriesId, recurrenceId));
      const stays =
        from?.override !== undefined &&
        keyOf(from.override.seriesId, from.override.recurrenceId) === keyOf(seriesId, recurrenceId);
      // The etag of the version on screen, or of the instance just read.
      let instance: GoogleEvent;
      try {
        instance = stays ? from.data : await api.instance(seriesId, recurrenceId.toString());
      } catch (error) {
        // An occurrence to cancel whose series is gone is gone too.
        if (placement === "cancel" && !stored.has(seriesId) && isStatus(error, 404, 410)) continue;
        throw error;
      }
      // Cancelled in Google since it loaded: a change to it would bring it back.
      if (from === undefined && instance.status === "cancelled" && placement !== "cancel") {
        throw new GoogleApiError(410, "deleted", "The occurrence was deleted in Google Calendar.");
      }
      if (placement === "cancel") await remove(instance, instance.etag);
      // The moved occurrence's own title, color and the rest, not the instance's.
      else await replace(instance, from?.data ?? instance, placement, instance.etag, timeZone);
      if (from !== undefined && !stays) vacated.push(from);
    }
    for (const { data, override } of vacated) {
      if (override === undefined || written.has(keyOf(override.seriesId, override.recurrenceId))) {
        continue;
      }
      // No etags: the edit replaces these, whatever changed on them since.
      const master = stored.get(override.seriesId);
      const occurrence = master && occurrenceAt(master, override.recurrenceId);
      // The series' rule still has an occurrence there, so it shows as the series has it.
      if (master !== undefined && occurrence !== undefined) {
        await replace(data, master, occurrence, undefined, timeZone);
      } else {
        await remove(data, undefined);
      }
    }
  }

  /**
   * Replaces `instance` with `content` at `interval`: all of it, with `events.update`, so nothing
   * of what was there before stays.
   */
  async function replace(
    instance: GoogleEvent,
    content: GoogleEvent,
    interval: CalendarEventInterval,
    etag: string | undefined,
    timeZone: string,
  ) {
    const fields: GoogleEventWrite = {
      ...contentOf(content),
      ...toGoogleTimes(interval, content.start?.timeZone ?? timeZone),
      originalStartTime: instance.originalStartTime,
      recurringEventId: instance.recurringEventId,
      // A cancelled instance comes back.
      status: content.status === "tentative" ? "tentative" : "confirmed",
    };
    try {
      apply([await api.update(instance.id, fields, etag)]);
    } catch (error) {
      // An instance the edit clears may be gone already.
      if (etag !== undefined || !isStatus(error, 404, 410)) throw error;
    }
  }
  // #endregion series

  return {
    getEvents: () => events,
    load: (range) => enqueue(() => loadNow(range)),
    save: (edit, timeZone) => enqueue(() => saveNow(edit, timeZone)),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    sync: () => enqueue(syncNow),
  };
}

// #region times
/**
 * An interval as Google's `start` and `end`, on `timeZone`'s clock unless the event has its own.
 * Each sets the field it uses and clears the other, so a move between all-day and timed works.
 */
export function toGoogleTimes(
  interval: CalendarEventInterval,
  timeZone: string,
): Pick<GoogleEventWrite, "end" | "start"> {
  if (interval.kind === "all-day") {
    // Google's `end.date` is the day after the last one, as the calendar's `end` is.
    const date = (day: Temporal.PlainDate) => ({ date: day.toString(), dateTime: null });
    return { end: date(interval.end), start: date(interval.start) };
  }
  const zone = (interval.kind === "timed" && interval.sourceTimeZone) || timeZone;
  const time = (at: Temporal.Instant | Temporal.PlainDateTime) => ({
    date: null,
    // RFC 3339 with the offset, such as 2026-10-20T11:00:00+02:00.
    dateTime: (at instanceof Temporal.Instant
      ? at.toZonedDateTimeISO(zone)
      : at.toZonedDateTime(zone)
    ).toString({ timeZoneName: "never" }),
    timeZone: zone,
  });
  return { end: time(interval.end), start: time(interval.start) };
}

/** Google event IDs are base32hex: lowercase a–v and digits. A UUID's hex digits fit. */
export const newGoogleId = () => crypto.randomUUID().replaceAll("-", "");
// #endregion times

/** The instance of `seriesId` at `recurrenceId`, written with a placement, or cancelled. */
interface OccurrenceWrite {
  /** The exception that showed the occurrence until now, if it had one. */
  readonly from?: GoogleCalendarEvent | undefined;
  readonly placement: CalendarEventInterval | "cancel";
  readonly recurrenceId: RecurrenceDate;
  readonly seriesId: string;
}

const keyOf = (seriesId: string, recurrenceId: RecurrenceDate) =>
  `${seriesId} ${recurrenceId.toString()}`;

const isStatus = (error: unknown, ...statuses: number[]) =>
  error instanceof GoogleApiError && statuses.includes(error.status);

/** Fields Google sets, and those that name an event or its place in a series. */
const identity = [
  "created",
  "creator",
  "etag",
  "hangoutLink",
  "htmlLink",
  "iCalUID",
  "id",
  "kind",
  "organizer",
  "originalStartTime",
  "recurrence",
  "recurringEventId",
  "sequence",
  "updated",
];

/** An event's content, to copy onto another: its title, color, guests and the rest. */
function contentOf(event: GoogleEvent): GoogleEventWrite {
  const content: Record<string, unknown> = { ...event };
  for (const field of identity) delete content[field];
  return content as GoogleEventWrite;
}

const expander = createOccurrenceExpander(createCanonicalRecurrenceAdapter<GoogleEvent>());

/** The occurrence a master's rule puts at `recurrenceId`, if it puts one there. */
function occurrenceAt(master: GoogleEvent, recurrenceId: RecurrenceDate) {
  const date =
    recurrenceId instanceof Temporal.Instant
      ? recurrenceId.toZonedDateTimeISO("UTC").toPlainDate()
      : Temporal.PlainDate.from(recurrenceId);
  const { occurrences } = expander.expand(fromGoogleEvents([master]).events, {
    range: { end: date.add({ days: 2 }), start: date.subtract({ days: 1 }) },
    timeZone: "UTC",
  });
  return occurrences.find(
    (occurrence) => occurrence.recurrence?.recurrenceId.toString() === recurrenceId.toString(),
  )?.interval;
}

const compare = (a: Temporal.Instant, b: Temporal.Instant) => Temporal.Instant.compare(a, b);

/** The parts of `range` that `loaded`, sorted and apart, doesn't cover. */
function missing(loaded: readonly TimeRange[], range: TimeRange): TimeRange[] {
  const gaps: TimeRange[] = [];
  let start = range.start;
  for (const done of loaded) {
    if (compare(done.start, range.end) >= 0) break;
    if (compare(done.end, start) <= 0) continue;
    if (compare(done.start, start) > 0) gaps.push({ end: done.start, start });
    start = done.end;
  }
  if (compare(start, range.end) < 0) gaps.push({ end: range.end, start });
  return gaps;
}

/** `loaded` with `range` added, sorted, with ranges that touch joined. */
function merged(loaded: readonly TimeRange[], range: TimeRange): TimeRange[] {
  const sorted = [...loaded, range].sort((a, b) => compare(a.start, b.start));
  const joined: TimeRange[] = [];
  for (const next of sorted) {
    const last = joined.at(-1);
    if (last !== undefined && compare(next.start, last.end) <= 0) {
      const end = compare(next.end, last.end) > 0 ? next.end : last.end;
      joined[joined.length - 1] = { end, start: last.start };
    } else {
      joined.push(next);
    }
  }
  return joined;
}
