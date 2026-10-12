import type { CalendarEventChange, EventId, ResourceId } from "@moltenship/calendar-core";

import type { RecurrenceAdapters } from "../types";
import { datesEqual } from "./dates";
import { resolveAll } from "./scope-all";
import { resolveFollowing } from "./scope-following";
import { resolveThis } from "./scope-this";
import { loadSeries, type Change } from "./series";
import type {
  RecurrenceEdit,
  RecurrenceEditScope,
  RecurrenceOccurrenceChange,
  ResolveRecurrenceEditOptions,
} from "./types";

const scopes: readonly RecurrenceEditScope[] = ["this", "following", "all"];

/**
 * Whether a change is to an occurrence of a series, so the application should ask for a scope. A
 * create, or a change to a one-off event, needs none; `resolveRecurrenceEdit` passes it through.
 */
export function isRecurringChange<
  TEvent,
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
>(
  change: RecurrenceOccurrenceChange<TEvent, TEventId, TResourceId>,
): change is Change<TEvent, TEventId, TResourceId> {
  return change.cause !== "create" && change.event.recurrence !== undefined;
}

function unwrap<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(
  change: RecurrenceOccurrenceChange<TEvent, TEventId, TResourceId>,
  adapters: RecurrenceAdapters<TEvent, TEventId, TResourceId>,
): CalendarEventChange<TEvent, TEventId, TResourceId> {
  if (change.cause === "create") return change;
  const { event } = change.event;
  const eventId = adapters.event.getId(event);
  // The same spread on both sides, so each keeps its own member of the change union.
  return change.cause === "delete" ? { ...change, event, eventId } : { ...change, event, eventId };
}

/**
 * Turns a change to an occurrence into what the application persists, for the scope the user
 * picked. It reads the change and the adapters only: it never mutates them or calls application
 * code. The occurrence's `recurrence` names the series, so IDs are never parsed.
 *
 * - **Not recurring:** a create, or a change to a one-off event, passes through as `type: "event"`
 *   with the event unwrapped.
 * - **`"this"`:** a move, resize or update creates the occurrence's override, or updates it,
 *   keeping its `recurrenceId` and so its occurrence ID. A delete adds the original start to the
 *   master's EXDATEs and deletes an existing override. Google's API records a deleted instance as a
 *   cancelled one instead; this package reads those as `RecurrenceOverride.cancelled`, but writes
 *   EXDATE, which every iCalendar store understands. An override whose master isn't loaded can still
 *   change: a delete then marks it `cancelled`, since there's no EXDATE to add.
 * - **`"following"`:** the master ends right before the occurrence: UNTIL becomes the previous
 *   occurrence's start, which the engine finds, or, for a rule that ends by COUNT alone, COUNT the
 *   number of occurrences before it, excluded ones included. A new series starts where the change
 *   puts the occurrence, with the rest of the rule moved as `"all"` moves it, its COUNT reduced and
 *   its UNTIL moved. Later EXDATEs, RDATEs and overrides move to it. Google Calendar splits a series
 *   this way, as Outlook on the web does; classic Outlook offers only one occurrence or the whole
 *   series, and RANGE=THISANDFUTURE isn't written. A delete only ends the series, dropping later
 *   dates and overrides. When nothing before the occurrence is left to show, as on the first one,
 *   it is `"all"`. From an occurrence only an RDATE adds, a series with a rule can be ended but not
 *   continued.
 * - **`"all"`:** the series changes as the user changed the occurrence: the delta from where it
 *   showed to where it goes, measured on the series' own wall clock (`sourceTimeZone` for a timed
 *   series), applies to every occurrence's original start. So a moved override that is dragged a
 *   day moves the series a day, at its own time, and one that is stretched stretches the series.
 *   The calendar moves an occurrence on the clock it shows, so in a zone whose DST changes on other
 *   dates than the series', a drag by days can change the series' time by an hour. The rule moves
 *   with the delta (BYDAY, month and year days, BYMONTH, BYHOUR, BYMINUTE, BYSECOND and WKST; see
 *   `shiftRule`), and so do EXDATEs, RDATEs, UNTIL and every override's `recurrenceId`, so deleted
 *   occurrences stay deleted and moved ones don't appear twice. Under an ordinal weekday rule, each
 *   date moves to the new weekday of its own month; when that isn't where the edited occurrence
 *   goes, as the 2nd Wednesday isn't the day after the 2nd Tuesday in a month that starts on a
 *   Wednesday, the edit is rejected. Overrides keep their placements; the edited one takes the
 *   proposed placement. A start dropped on the second of two equal wall times, as DST's end
 *   repeats an hour, lands on the first, as every occurrence of the series does. A move keeps the
 *   series' length; a resize or an update changes it as it changed the occurrence, in DURATION when
 *   the series has one. A delete removes the master and its overrides.
 * - **Kind changes:** a timed occurrence dropped on a day, or an all-day one dropped on a time, is
 *   handled in every scope. For `"this"` the override takes the new kind and keeps its original
 *   start. For `"all"` and `"following"` the series takes the new kind and its dates convert; a
 *   rule with several times a day can't become all-day.
 *
 * A rejection says why a scope can't apply, such as a BYSETPOS rule moved to another day, or a rule
 * the engine can't expand; `recurrenceEditScopes` offers only the scopes that apply.
 */
export function resolveRecurrenceEdit<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
>(
  change: RecurrenceOccurrenceChange<TEvent, TEventId, TResourceId>,
  scope: RecurrenceEditScope,
  adapters: RecurrenceAdapters<TEvent, TEventId, TResourceId>,
  options: ResolveRecurrenceEditOptions<TEvent, TEventId> = {},
): RecurrenceEdit<TEvent, TEventId, TResourceId> {
  if (!isRecurringChange(change)) return { change: unwrap(change, adapters), type: "event" };
  if (scope === "this") return resolveThis(change, adapters, options);
  const series = loadSeries(change, adapters, options);
  if ("type" in series) return series;
  return scope === "following" && !datesEqual(series.recurrenceId, series.first.start)
    ? resolveFollowing(change, series, adapters, options)
    : resolveAll(change, series, adapters, options);
}

/**
 * The scopes worth offering for a change: none for a change that isn't recurring, else those
 * `resolveRecurrenceEdit` can apply, without `"following"` where it means `"all"`, as on the first
 * occurrence. Hand them to the scope dialog.
 */
export function recurrenceEditScopes<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
>(
  change: RecurrenceOccurrenceChange<TEvent, TEventId, TResourceId>,
  adapters: RecurrenceAdapters<TEvent, TEventId, TResourceId>,
  options: ResolveRecurrenceEditOptions<TEvent, TEventId> = {},
): readonly RecurrenceEditScope[] {
  if (!isRecurringChange(change)) return [];
  // The ID map isn't needed to know whether a scope applies.
  const { occurrences: _occurrences, ...checking } = options;
  return scopes.filter((scope) => {
    const edit = resolveRecurrenceEdit(change, scope, adapters, checking);
    return edit.type === "series" && edit.scope === scope;
  });
}
