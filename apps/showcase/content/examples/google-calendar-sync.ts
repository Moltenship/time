// #region store
// lib/google-calendar-sync.ts
import type { CalendarEventChange, CalendarEventInterval } from "@moltenship/calendar";
import {
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
  /** Lists the parts of `range` that aren't loaded yet. */
  readonly load: (range: TimeRange) => Promise<void>;
  /** Applies every change since the last sync, or starts again after a 410. */
  readonly sync: () => Promise<void>;
  /** Writes an edit to Google, then syncs. Throws, after the sync, if Google refused a write. */
  readonly save: (edit: GoogleEdit, timeZone: string) => Promise<void>;
}

export function createGoogleCalendarSync(api: GoogleCalendarApi): GoogleCalendarSync {
  /** Google's events by ID: masters, changed and cancelled occurrences, one-off events. */
  const stored = new Map<string, GoogleEvent>();
  const mapped = new WeakMap<GoogleEvent, GoogleCalendarEvent | null>();
  const listeners = new Set<() => void>();
  let events: readonly GoogleCalendarEvent[] = [];
  let loaded: TimeRange[] = [];
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
    events = [...stored.values()].flatMap((item) => {
      if (!mapped.has(item)) {
        const {
          events: [event],
          problems,
        } = fromGoogleEvents([item]);
        for (const problem of problems) console.warn(`Google Calendar: ${problem}`);
        mapped.set(item, event ?? null);
      }
      return mapped.get(item) ?? [];
    });
    for (const listener of listeners) listener();
  }

  /** Google's answer, by ID. A cancelled occurrence stays, since it hides that occurrence. */
  function apply(items: readonly GoogleEvent[]) {
    for (const item of items) {
      if (item.status !== "cancelled" || item.recurringEventId !== undefined) {
        stored.set(item.id, item);
        continue;
      }
      stored.delete(item.id);
      // A deleted series takes its changed and cancelled occurrences with it.
      for (const [id, other] of stored) if (other.recurringEventId === item.id) stored.delete(id);
    }
  }
  // #endregion store

  // #region load
  async function loadNow(range: TimeRange) {
    lastRange = range;
    for (const gap of missing(loaded, range)) {
      // All-day events are dates on the Google calendar's own clock, which may not be the one on
      // screen, so the request reaches a day further each way.
      const { items, nextSyncToken } = await api.list({
        timeMax: gap.end.add({ hours: 24 }),
        timeMin: gap.start.subtract({ hours: 24 }),
      });
      apply(items);
      loaded = merged(loaded, gap);
      // The first list starts the sync. A later token would skip what changed between the two.
      syncToken ??= nextSyncToken;
      changed();
    }
  }
  // #endregion load

  // #region sync
  async function syncNow() {
    if (syncToken === undefined) return;
    try {
      // Changes to any event, on any date: apply them all.
      const { items, nextSyncToken } = await api.list({ syncToken });
      apply(items);
      syncToken = nextSyncToken ?? syncToken;
    } catch (error) {
      // 410 Gone: the token expired. Drop everything and load the dates on screen again. The old
      // events stay on screen until the new ones arrive.
      if (!(error instanceof GoogleApiError && error.status === 410)) throw error;
      stored.clear();
      loaded = [];
      syncToken = undefined;
      if (lastRange !== undefined) await loadNow(lastRange);
    }
    changed();
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
      const id = newGoogleId();
      apply([
        await api.insert({ id, summary: "New event", ...toGoogleTimes(change.proposed, timeZone) }),
      ]);
      return;
    }
    const { data } = change.event;
    if (change.cause === "delete") {
      await api.remove(data.id, data.etag);
      apply([{ id: data.id, status: "cancelled" }]);
      return;
    }
    const zone = data.start?.timeZone ?? timeZone;
    // The etag of the version on screen: if someone changed it since, Google answers 412.
    apply([await api.patch(data.id, toGoogleTimes(change.proposed, zone), data.etag)]);
  }
  // #endregion save

  // #region series
  async function saveSeries(
    edit: RecurrenceSeriesEdit<GoogleCalendarEvent, string, string>,
    timeZone: string,
  ) {
    const { newSeries, override, series, seriesId } = edit;
    const zoneOf = (event: GoogleCalendarEvent) => event.data.start?.timeZone ?? timeZone;
    // "This event" deletes cancel the occurrence's instance, as Google does, and leave the master.
    if (edit.scope === "this" && edit.cause === "delete") {
      const from = override?.action === "create" ? undefined : override?.event;
      await writeOccurrences([
        { fields: "cancel", from, recurrenceId: edit.recurrenceId, seriesId },
      ]);
      return;
    }
    // Read before the writes: the series' other changed and cancelled occurrences.
    const edited =
      override === undefined || override.action === "create" ? undefined : override.event;
    const others = events.filter(
      (event) => event.override?.seriesId === seriesId && event !== edited,
    );

    if (series.action === "delete") {
      // Google deletes the series' changed and cancelled occurrences with it.
      await api.remove(seriesId, series.event.data.etag);
      apply([{ id: seriesId, status: "cancelled" }]);
      return;
    }
    if (series.action === "update") {
      // The new `recurrence` is written from what `fromGoogleEvents` read, which would drop the
      // lines it couldn't, such as EXRULE.
      if (readGoogleRecurrence(series.event.data.recurrence ?? []).problems.length > 0) {
        throw new Error("This series has rules the app can't write back. Change it in Google.");
      }
      const zone = zoneOf(series.event);
      const fields = {
        ...toGoogleTimes(series.placement, zone),
        recurrence: toGoogleRecurrence(series.recurrence, zone),
      };
      apply([await api.patch(seriesId, fields, series.event.data.etag)]);
    }
    // "This and following events": Google's split is a new event, with no link to the old one.
    const newSeriesId = newSeries?.id ?? newGoogleId();
    if (newSeries !== undefined) {
      const zone = zoneOf(newSeries.from);
      const fields = {
        ...contentOf(newSeries.from.data),
        id: newSeriesId,
        ...toGoogleTimes(newSeries.placement, zone),
        recurrence: toGoogleRecurrence(newSeries.recurrence, zone),
      };
      apply([await api.insert(fields)]);
    }

    // The edited occurrence, and the series' other changed occurrences, which follow the new times
    // or end with the old series.
    const writes: OccurrenceWrite[] = [];
    const cancels: GoogleCalendarEvent[] = [];
    if (override?.action === "create") {
      const fields = toGoogleTimes(override.placement, zoneOf(override.from));
      writes.push({ fields, recurrenceId: override.recurrenceId, seriesId });
    } else if (override?.action === "update") {
      writes.push({
        fields: override.cancelled
          ? "cancel"
          : toGoogleTimes(override.placement, zoneOf(override.event)),
        from: override.event,
        recurrenceId: override.recurrenceId,
        seriesId: override.series === "new" ? newSeriesId : seriesId,
      });
    } else if (override?.action === "delete") {
      cancels.push(override.event);
    }
    for (const other of others) {
      const next = recurrenceOverrideEdit(edit, other.override!.recurrenceId);
      if (next.action === "delete") cancels.push(other);
      if (next.action !== "update") continue;
      writes.push({
        fields: other.override!.cancelled
          ? "cancel"
          : { ...contentOf(other.data), ...toGoogleTimes(other, zoneOf(other)) },
        from: other,
        recurrenceId: next.recurrenceId,
        seriesId: next.series === "new" ? newSeriesId : seriesId,
      });
    }
    await writeOccurrences(writes, cancels);
  }

  /**
   * Changes or cancels the instances `writes` name, then cancels the exceptions they leave and
   * `cancels`. Google names an exception by its series and original start, and neither can
   * change, so an occurrence that moves to another original start is written to the instance
   * there. One may land where another leaves, so every write comes before the cancels.
   */
  async function writeOccurrences(
    writes: readonly OccurrenceWrite[],
    cancels: readonly GoogleCalendarEvent[] = [],
  ) {
    const written = new Set<string>();
    const left = [...cancels];
    for (const { fields, from, recurrenceId, seriesId } of writes) {
      written.add(keyOf(seriesId, recurrenceId));
      const stays =
        from !== undefined &&
        keyOf(from.override!.seriesId, from.override!.recurrenceId) ===
          keyOf(seriesId, recurrenceId);
      // With the etag of the version on screen, or of the instance just read.
      const instance = stays ? from.data : await api.instance(seriesId, recurrenceId.toString());
      if (fields === "cancel") {
        await cancel(instance, instance.etag);
      } else {
        // An instance that was cancelled comes back.
        const status = instance.status === "cancelled" ? { status: "confirmed" as const } : {};
        apply([await api.patch(instance.id, { ...fields, ...status }, instance.etag)]);
      }
      if (from !== undefined && !stays) left.push(from);
    }
    for (const event of left) {
      const { recurrenceId, seriesId } = event.override!;
      // No etag: the edit replaces these, whatever changed on them since.
      if (!written.has(keyOf(seriesId, recurrenceId))) await cancel(event.data, undefined);
    }
  }

  /** Deletes an occurrence's instance, which Google keeps as a cancelled one. */
  async function cancel(instance: GoogleEvent, etag: string | undefined) {
    if (instance.status === "cancelled") return;
    try {
      await api.remove(instance.id, etag);
    } catch (error) {
      // 404 or 410: already gone, as an instance outside a shortened series may be.
      if (!(error instanceof GoogleApiError && (error.status === 404 || error.status === 410))) {
        throw error;
      }
    }
    apply([{ ...instance, status: "cancelled" }]);
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

/** The instance of `seriesId` at `recurrenceId`, changed to `fields`, or cancelled. */
interface OccurrenceWrite {
  readonly fields: GoogleEventWrite | "cancel";
  /** The exception that showed the occurrence until now, if it had one. */
  readonly from?: GoogleCalendarEvent | undefined;
  readonly recurrenceId: RecurrenceDate;
  readonly seriesId: string;
}

const keyOf = (seriesId: string, recurrenceId: RecurrenceDate) =>
  `${seriesId} ${recurrenceId.toString()}`;

/** What a copy of an event keeps. A real app copies its description, guests and reminders too. */
function contentOf(event: GoogleEvent): GoogleEventWrite {
  const { colorId, summary, transparency } = event;
  return { colorId, summary, transparency };
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
      joined[joined.length - 1] = {
        end: compare(next.end, last.end) > 0 ? next.end : last.end,
        start: last.start,
      };
    } else {
      joined.push(next);
    }
  }
  return joined;
}
