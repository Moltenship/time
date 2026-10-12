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
  return change.cause === "delete" ? { ...change, event, eventId } : { ...change, event, eventId };
}

/**
 * Turns a change to an occurrence into what the application persists, for the scope the user
 * picked. It reads the change and the adapters only: it never mutates them or calls application
 * code. The occurrence's `recurrence` names the series, not its ID, so IDs are never parsed.
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
 *   occurrence's start, which the engine finds, or COUNT the number of occurrences before it.
 *   A new series starts at the proposed placement with the rest of the rule, moved as `"all"`
 *   moves it, its COUNT reduced or its UNTIL moved. Later EXDATEs, RDATEs and overrides move to it.
 *   This is how Google and Outlook split a series; RANGE=THISANDFUTURE isn't written. A delete only
 *   ends the series, and drops the later dates and overrides. On the first occurrence it is `"all"`.
 *   An occurrence only an RDATE adds is rejected when the series has a rule, which can't continue
 *   from a date it doesn't produce.
 * - **`"all"`:** the master moves by the edited occurrence's delta, measured from its original start
 *   in the series' own time: the wall clock of `sourceTimeZone` for timed series, so a change made
 *   while the calendar shows another zone still keeps 09:00 at 09:00 across DST. The rule moves with
 *   it (see `shiftRule` in the docs: BYDAY weekdays by the day delta, ordinals kept, month and year
 *   days, BYMONTH, BYHOUR, BYMINUTE). EXDATEs, RDATEs, UNTIL and every override's `recurrenceId`
 *   move by the same delta, so deleted occurrences stay deleted and moved ones don't appear twice.
 *   Overrides keep their own placements; the edited one takes the proposed placement. A move keeps
 *   the series' length; a resize or an update takes the occurrence's, in DURATION when the series
 *   has one. A delete removes the master and its overrides.
 * - **Kind changes:** a timed occurrence dropped on a day, or an all-day one dropped on a time, is
 *   handled in every scope. For `"this"` the override takes the new kind and keeps its original
 *   start. For `"all"` and `"following"` the series takes the new kind and its dates convert, a
 *   rule with several times a day excepted, which can't become all-day.
 *
 * A rejection says why a scope can't apply, such as a BYSETPOS rule moved to another day; the
 * application can offer the scopes that can with `recurrenceEditScopes`.
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
  return scopes.filter((scope) => {
    const edit = resolveRecurrenceEdit(change, scope, adapters, options);
    return edit.type === "series" && edit.scope === scope;
  });
}
