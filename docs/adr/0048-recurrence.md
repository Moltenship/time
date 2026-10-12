# ADR 0048: Recurrence as a layer over ordinary events

- Status: Accepted
- Date: 2026-10-12
- Issues: [#48](https://github.com/Moltenship/time/issues/48),
  [#49](https://github.com/Moltenship/time/issues/49), epic [#2](https://github.com/Moltenship/time/issues/2)

## Context

Applications store repeating events the way iCalendar, Google Calendar and Outlook do: one master
event with a rule, the occurrences it removes, extra occurrences, and separate events that replace
single occurrences. The calendar renders, indexes, lays out and edits ordinary events, and its
transactions, policies and views must not learn about series (ADR 0005). Series can be infinite, so
nothing may expand them past the dates on screen. `@moltenship/ics` already parses RRULE, EXDATE,
RDATE and RECURRENCE-ID into Temporal values (ADR 0151).

## Decision

1. **A layer, not a core change.** `@moltenship/calendar-recurrence` turns the application's events
   into `RecurrenceOccurrence` objects for a date range, and `createOccurrenceAdapter` makes them an
   `EventAdapter` the calendar takes like any other. Core, React, DnD and the registry views import
   nothing from recurrence. The package has no React dependency; applications memoize expansion
   with their framework's tools.
2. **Input mirrors iCalendar.** A `RecurrenceAdapter`, beside the `EventAdapter`, reads a master's
   `EventRecurrence` (rule, `exceptionDates`, `recurrenceDates`) and an override's
   `RecurrenceOverride` (series ID, `recurrenceId`, `thisAndFuture`). The master's interval is the
   first occurrence, as DTSTART and DTEND are. RDATEs are starts; their occurrences last as long as
   the first. `RecurringCalendarEvent` and `createCanonicalRecurrenceAdapter` cover applications
   without their own event type, as `createCanonicalEventAdapter` does in core.
3. **Rules come from `@moltenship/ics`.** `RecurrenceRule` is `IcsRecurrenceRule` with UNTIL as a
   Temporal value, so the package depends on `ics`, which has no dependencies. `parseRecurrenceRule`
   and `formatRecurrenceRule` read and write RRULE text through it, and an ICS bridge groups parsed
   `IcsEvent`s into masters and overrides.
4. **Each series repeats in its own time.** Every recurrence date takes the kind of the first
   occurrence: `Instant` for timed series, `PlainDate` for all-day, `PlainDateTime` for floating.
   Timed series repeat on the wall clock of `sourceTimeZone`, or UTC without one, so a 09:00 weekly
   meeting stays at 09:00 across DST. A start in a gap moves forward and a repeated time takes its
   first occurrence (RFC 5545 §3.3.10, Temporal's `compatible`). The first occurrence always counts,
   as RFC 5545 says, even when the rule wouldn't produce it. The engine covers all of RFC 5545:
   every FREQ, every BY part, BYSETPOS, WKST, COUNT and UNTIL. Dates RFC 5545 calls invalid, such as
   30 February, are skipped.
5. **Expansion is bounded by the queried range.** `OccurrenceRange` is a half-open date range and
   the calendar's time zone, as `onVisibleRangeChange` reports `loadRange`. An occurrence is included
   when its interval overlaps the range, so one starting before it still shows. COUNT counts from the
   first occurrence. `maxIterations` caps the steps per series and reports an `iteration-limit`
   issue rather than hanging. The expander reuses work for events that are the same objects as last
   time.
6. **Occurrence identity is the series and the original start.** An occurrence's ID is
   `occurrenceId(seriesId, recurrenceId)`, `<seriesId>::<ISO original start>`, with instants in UTC,
   so it survives view, range and time zone changes and reloads. An override keeps the original
   start, so a moved occurrence keeps its ID, its selection and its focus. One-off events keep their
   own IDs. Overrides always pass through, like one-off events, and replace the generated
   occurrence they name, so an occurrence moved into or out of the range is handled.
7. **Edits name their scope.** A change from the calendar arrives at `onEventChange` for an
   occurrence. `resolveRecurrenceEdit(change, scope)` turns it into what the application persists for
   `"this"` (create or update an override, or add an exception date), `"following"` (end the series
   before the occurrence and start a new one there) or `"all"` (change the master, moving the rule
   with it, such as BYDAY when the day changes). The application asks which scope it means while its
   `onEventChange` promise is pending, so the change stays visible and a cancel rolls it back. The
   registry's scope dialog takes no recurrence types, so registry source keeps depending only on the
   facade.
8. **Optimistic display stays per occurrence.** Until the application's events reflect a series
   edit, only the dragged occurrence shows the change. Core's pending overlay is keyed by event ID,
   and moving it to series would make core recurrence-aware.

## Consequences

- Recurrence costs nothing for applications that don't import it.
- Applications wire two adapters and expand per `loadRange`; the docs show the pattern.
- A series edit shows on the other occurrences only after the application's events change.
- The package follows `ics`'s release line, since its rule type is `ics`'s.

## Reversal trigger

Revisit if core needs series semantics for something no layer can provide, such as optimistic
display of whole-series edits, or if a Temporal-native RRULE engine appears that covers RFC 5545
and its DST rules as well as this one.
