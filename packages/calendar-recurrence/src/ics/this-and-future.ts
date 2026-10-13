import type {
  CalendarEventInterval,
  CalendarEventPlacement,
  EventId,
} from "@moltenship/calendar-core";
import type { IcsEvent, IcsExtensionsConfig } from "@moltenship/ics";

import { applyRecurrenceEdit, resolveRecurrenceEdit } from "../edits";
import type { RecurrenceOccurrenceChange } from "../edits";
import { compareDates } from "../internal/dates";
import { occurrenceId } from "../occurrence-id";
import { createCanonicalRecurrenceAdapter, createOccurrenceExpander } from "../series";
import type { RecurrenceDate, RecurrenceOccurrence, RecurringCalendarEvent } from "../types";

type Event<TExtensions extends IcsExtensionsConfig> = RecurringCalendarEvent<IcsEvent<TExtensions>>;

/** Only the interval's fields of an event. */
function intervalOf(event: CalendarEventInterval): CalendarEventInterval {
  return event.kind === "timed"
    ? {
        end: event.end,
        kind: "timed",
        start: event.start,
        ...(event.sourceTimeZone === undefined ? {} : { sourceTimeZone: event.sourceTimeZone }),
      }
    : ({ end: event.end, kind: event.kind, start: event.start } as CalendarEventInterval);
}

/**
 * A master an edit wrote, in the bridge's shape: without the empty resource list its placement
 * brings, since the bridge never sets resources, or empty lists of dates.
 */
function tidy<TExtensions extends IcsExtensionsConfig>(
  event: Event<TExtensions>,
): Event<TExtensions> {
  const { recurrence, resourceIds, ...rest } = event;
  if (recurrence === undefined) return event;
  const { exceptionDates, recurrenceDates, ...fields } = recurrence;
  return {
    ...rest,
    ...(resourceIds === undefined || resourceIds.length === 0 ? {} : { resourceIds }),
    recurrence: {
      ...fields,
      ...(exceptionDates === undefined || exceptionDates.length === 0 ? {} : { exceptionDates }),
      ...(recurrenceDates === undefined || recurrenceDates.length === 0 ? {} : { recurrenceDates }),
    },
  };
}

/**
 * The recurrence of a series that starts at an override written in a DST gap: it repeats at the
 * written time, as a master written there does.
 */
function writtenStartOf<TExtensions extends IcsExtensionsConfig>(
  master: Event<TExtensions>,
  data: IcsEvent<TExtensions>,
): Event<TExtensions>["recurrence"] {
  const { recurrence } = master;
  const { start } = data;
  if (recurrence === undefined || master.kind !== "timed" || start.kind !== "zoned") {
    return recurrence;
  }
  const inGap = !start.wallTime.equals(start.zoned.toPlainDateTime());
  return inGap &&
    master.sourceTimeZone === start.zoned.timeZoneId &&
    master.start.equals(start.zoned.toInstant())
    ? { ...recurrence, wallStart: start.wallTime }
    : recurrence;
}

/** The occurrence a master gives at `recurrenceId`, as the expander shows it without overrides. */
function occurrenceAt<TExtensions extends IcsExtensionsConfig>(
  master: Event<TExtensions>,
  recurrenceId: RecurrenceDate,
  timeZone: string,
): RecurrenceOccurrence<Event<TExtensions>, string> | undefined {
  const zone = master.kind === "timed" ? (master.sourceTimeZone ?? timeZone) : timeZone;
  const day =
    recurrenceId instanceof Temporal.Instant
      ? recurrenceId.toZonedDateTimeISO(zone).toPlainDate()
      : recurrenceId instanceof Temporal.PlainDateTime
        ? recurrenceId.toPlainDate()
        : recurrenceId;
  const expander = createOccurrenceExpander(
    createCanonicalRecurrenceAdapter<IcsEvent<TExtensions>>(),
    { defaultTimeZone: timeZone },
  );
  const { occurrences } = expander.expand([master], {
    range: { end: day.add({ days: 2 }), start: day.subtract({ days: 1 }) },
    timeZone: zone,
  });
  const id = occurrenceId(master.id, recurrenceId);
  return occurrences.find((occurrence) => occurrence.id === id);
}

export interface ThisAndFuture<TExtensions extends IcsExtensionsConfig> {
  readonly events: readonly Event<TExtensions>[];
  /** Overrides that stayed single, with why. */
  readonly failures: ReadonlyMap<IcsEvent<TExtensions>, string>;
}

/**
 * Applies overrides with RANGE=THISANDFUTURE as RFC 5545 §3.8.4.4 says: the occurrence they name
 * and every later one change by the same difference. Each splits its series as a `"following"`
 * edit does: the series ends before the occurrence, and a new one, with the override's ID, VEVENT
 * and title, starts where the override is, with the rest of the rule moved by the same difference
 * and the override's length. Later EXDATEs, RDATEs and overrides move to it and keep their own
 * placements, since instances in separate components aren't impacted. On the first occurrence it
 * changes the whole series instead, and a new series that starts in a DST gap repeats at the time
 * written. A cancelled one ends the series there; when nothing before it is left, the series keeps
 * no occurrence, but later overrides stay. One the edit can't apply, such as a BYSETPOS rule moved to
 * another day, stays an override of one occurrence, with the reason. Overrides end up with the IDs
 * of the occurrences they now replace.
 */
export function applyThisAndFuture<TExtensions extends IcsExtensionsConfig>(
  input: readonly Event<TExtensions>[],
  ranges: readonly IcsEvent<TExtensions>[],
  timeZone: string,
): ThisAndFuture<TExtensions> {
  const adapters = createCanonicalRecurrenceAdapter<IcsEvent<TExtensions>>();
  const failures = new Map<IcsEvent<TExtensions>, string>();
  // Series a cancelled one ended, which later ones can't name occurrences of.
  const ended = new Set<string>();
  let events: readonly Event<TExtensions>[] = input;
  const overrideOf = (data: IcsEvent<TExtensions>) =>
    events.findIndex((event) => event.data === data && event.override !== undefined);

  // Earlier ones first, since a later one names an original start the earlier one may move.
  const ordered = ranges
    .map((data) => ({ data, event: events[overrideOf(data)]! }))
    .sort((left, right) => {
      const { recurrenceId: leftId, seriesId: leftSeries } = left.event.override!;
      const { recurrenceId: rightId, seriesId: rightSeries } = right.event.override!;
      if (leftSeries !== rightSeries) return leftSeries < rightSeries ? -1 : 1;
      try {
        return compareDates(leftId, rightId);
      } catch {
        return 0;
      }
    });

  for (const { data } of ordered) {
    // Nothing removes an override, so each is still there.
    const index = overrideOf(data);
    const range = events[index]!;
    const { recurrenceId, seriesId } = range.override!;
    const cancelled = range.override!.cancelled === true;
    const master = events.find(
      (event) =>
        event.id === seriesId && event.override === undefined && event.recurrence !== undefined,
    );
    if (master === undefined) {
      failures.set(data, "its series isn't in the feed");
      continue;
    }
    const occurrence = occurrenceAt(master, recurrenceId, timeZone);
    if (occurrence === undefined) {
      const reason = ended.has(seriesId)
        ? "an earlier cancelled RANGE=THISANDFUTURE ended its series"
        : "its series has no occurrence at its RECURRENCE-ID";
      failures.set(data, reason);
      continue;
    }

    const original: CalendarEventPlacement<string> = {
      ...intervalOf(occurrence.interval),
      resourceIds: [],
    };
    // A timed override keeps the series' clock, whatever zone its own DTSTART was written in.
    const own = intervalOf(range);
    const proposed: CalendarEventPlacement<string> = {
      ...(own.kind === "timed" && master.kind === "timed"
        ? {
            ...own,
            ...(master.sourceTimeZone === undefined
              ? {}
              : { sourceTimeZone: master.sourceTimeZone }),
          }
        : own),
      resourceIds: [],
    };
    const base = { event: occurrence, eventId: occurrence.id, id: `range:${range.id}`, original };
    const change: RecurrenceOccurrenceChange<Event<TExtensions>, string, string> = cancelled
      ? { ...base, cause: "delete", proposed: null }
      : { ...base, cause: "update", proposed };
    const edit = resolveRecurrenceEdit(change, "following", adapters, {
      defaultTimeZone: timeZone,
      newSeriesId: range.id,
    });
    if (edit.type === "rejected") {
      failures.set(data, edit.message.replace(/\.$/, ""));
      continue;
    }
    if (edit.type !== "series") continue;

    const rest = events.filter((_, position) => position !== index);
    if (cancelled) ended.add(seriesId);
    if (cancelled && edit.scope === "all") {
      // Nothing before it is left, so the series keeps no occurrence: its first is excluded, and
      // no rule or RDATE adds others. Later overrides stay with it, as for a partial one.
      const none = {
        ...master,
        recurrence: { exceptionDates: [master.start] },
      } as Event<TExtensions>;
      events = rest.map((event) => (event === master ? none : event));
      continue;
    }
    // Instances in separate components aren't impacted, so a cancelled one keeps later overrides.
    const applied = cancelled
      ? { ...edit, otherOverrides: { action: "keep", series: "current" } as const }
      : edit;
    // The series that now shows the override: the new one, or the whole series.
    const shown = edit.newSeries === undefined ? seriesId : range.id;
    const written = applyRecurrenceEdit(rest, applied, { createId: () => range.id }).map(
      (event) => {
        // An override the edit creates for the occurrence, as at the later of two equal wall
        // times, shows the override's VEVENT too.
        if (event.override !== undefined && event.id === range.id && !cancelled) {
          return { ...event, data: range.data, title: range.title };
        }
        if (event.override !== undefined || (event.id !== seriesId && event.id !== range.id)) {
          return event;
        }
        if (cancelled || event.id !== shown) return tidy(event);
        const recurrence = writtenStartOf(event, range.data);
        return tidy({ ...event, data: range.data, recurrence, title: range.title });
      },
    );
    // The new series, which the edit adds last, comes from the override's VEVENT, so it takes the
    // override's place in the input order. A split deletes nothing, so the others keep theirs.
    events =
      edit.newSeries === undefined
        ? written
        : [...written.slice(0, index), written.at(-1)!, ...written.slice(index, -1)];
  }

  return {
    events: events.map((event) => {
      if (event.override === undefined) return event;
      const id = occurrenceId(event.override.seriesId as EventId, event.override.recurrenceId);
      return id === event.id ? event : { ...event, id };
    }),
    failures,
  };
}
