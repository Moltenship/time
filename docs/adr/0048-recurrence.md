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
   `EventRecurrence` (rule, `exceptionDates`, `recurrenceDates`, a DURATION and the written start of
   a DST-gap DTSTART) and an override's `RecurrenceOverride` (series ID, `recurrenceId`,
   `cancelled`). The master's interval is the first occurrence, as DTSTART and DTEND are.
   Occurrences last exactly as long as the first, or the DURATION's nominal length (RFC 5545
   §3.8.5.3). An RDATE is a start, or a PERIOD that keeps its own length. An override's
   `recurrenceId` takes the series' kind, so its ID is the same before and after its master loads.
   Cancelled overrides, which Google's API and ICS feeds use for deleted occurrences, hide the
   occurrence. An event that is both master and override is an override, with a
   `conflicting-recurrence` issue. RANGE=THISANDFUTURE isn't supported: Google and Outlook
   split the series instead, and the ICS bridge reports it and treats the override as a single one.
   `RecurringCalendarEvent` and `createCanonicalRecurrenceAdapter` cover applications without their
   own event type, as `createCanonicalEventAdapter` does in core.
3. **Rules come from `@moltenship/ics`.** `RecurrenceRule` is `IcsRecurrenceRule` with UNTIL as a
   Temporal value, so the package depends on `ics`, which has no dependencies. `parseRecurrenceRule`
   and `formatRecurrenceRule` read and write RRULE text through it, and an ICS bridge groups parsed
   `IcsEvent`s into masters and overrides.
4. **Each series repeats in its own time.** Every recurrence date takes the kind of the first
   occurrence: `Instant` for timed series, `PlainDate` for all-day, `PlainDateTime` for floating.
   `coerceRecurrenceDate` is the one place dates of another kind convert, as real feeds need: a UTC
   UNTIL on an all-day series, a date-only UNTIL on a timed one (the end of that day), a date-only
   EXDATE (the whole day). Instants on all-day and floating series read in the expander's
   `defaultTimeZone`, so the ICS bridge passes the feed's zone. A date it can't convert is dropped
   with an issue; the series stays. A DTSTART written inside a DST gap keeps repeating at its written
   wall time (`wallStart`), which is ignored once it no longer resolves to the start.
   Timed series repeat on the wall clock of `sourceTimeZone`, or the expander's `defaultTimeZone`
   (UTC unless set), so a 09:00 weekly meeting stays at 09:00 across DST. RFC 5545 §3.3.10 both
   ignores starts that don't exist and resolves them as §3.3.5 does; we choose the latter, Temporal's
   `compatible`: a start in a gap moves forward and counts, a repeated time takes its first instant.
   Dates that don't exist on any clock, such as 30 February, are skipped and don't count. The first
   occurrence is always one, and counts toward COUNT as §3.3.10 says, even when the rule wouldn't
   produce it or UNTIL is earlier. RFC 5545 leaves that set undefined and rrule.js and python-dateutil
   leave DTSTART out; we keep it because the application's event exists at that time. A rule with
   both COUNT and UNTIL, which some feeds write, ends at whichever comes first. BYHOUR, BYMINUTE and
   BYSECOND on an all-day series are ignored, as RFC 5545 says. The engine covers all of RFC 5545:
   every FREQ, every BY part, BYSETPOS, WKST, COUNT and UNTIL. It works and answers in the ISO
   calendar, and throws a `RecurrenceRuleError` whose `code` names the issue the series layer
   reports.
5. **Work is bounded by the queried range.** `OccurrenceRange` is a half-open date range and the
   calendar's time zone, as `onVisibleRangeChange` reports `loadRange`. An occurrence is included
   when its interval overlaps the range, so one starting before it still shows. Without COUNT the
   engine skips ahead to the range; COUNT counts from the first occurrence, and occurrences an EXDATE
   removes still count (RFC 5545 §3.8.5.1), the first one included. `maxIterations` caps the periods
   an engine visits per series, including ones that produce nothing but not ones it skips, and
   reports an `iteration-limit` issue rather than hanging. Starts come out strictly increasing; duplicates, such as two wall times
   resolving out of the same gap or an RDATE on a rule date, appear once. Overrides and one-off
   events pass through whatever the range, since the application already chose to load them. The
   expander reuses work for events that are the same objects as last time.
6. **Occurrence identity is the series and the original start.** An occurrence's ID is
   `occurrenceId(seriesId, recurrenceId)`, `<seriesId>::<ISO original start>`, with instants in UTC
   and dates in the ISO calendar, so it survives view, range and time zone changes and reloads. An
   override keeps the original start, so an occurrence moved with `"this"` keeps its ID, its
   selection and its focus. An override whose master isn't loaded keeps the same ID and has no
   `series`. One-off events keep their own IDs. Overrides replace the generated occurrence they name,
   so an occurrence moved into or out of the range is handled.
7. **Edits name their scope.** A change from the calendar arrives at `onEventChange` for an
   occurrence. `resolveRecurrenceEdit(change, scope)` turns it into what the application persists for
   `"this"` (create or update an override, or add an exception date), `"following"` (end the series
   before the occurrence and start a new one there, moving later exception dates, RDATEs and
   overrides to it and recomputing COUNT) or `"all"` (change the master, moving the rule with it, such
   as BYDAY when the day changes and a date-time UNTIL, dropping `wallStart`, and rekeying exception
   dates and overrides so deleted occurrences stay deleted and moved ones don't appear twice). `"following"` and `"all"` change occurrence IDs,
   so the edit maps old IDs to new ones for the application's selection. The application asks which
   scope it means while its `onEventChange` promise is pending, so the change stays visible and a
   cancel rolls it back. The registry's scope dialog takes no recurrence types, so registry source
   keeps depending only on the facade.
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
