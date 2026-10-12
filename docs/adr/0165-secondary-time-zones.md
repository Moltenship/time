# ADR 0165: Secondary time zones on the time grid's axis

- Status: Accepted
- Date: 2026-10-12
- Issue: [#165](https://github.com/Moltenship/time/issues/165)

## Context

People who work across time zones want the time grid to label its hours in a second zone, as
Google Calendar's "Display secondary time zone" does. The time grid's vertical axis is the display
zone's nominal 24-hour wall clock (ADR 0016): 23- and 25-hour days keep the same hour rows and show
DST as bands. Another zone's time at a line therefore depends on the date, on both zones' rules
that day, and on whether the display zone skips or repeats the line's wall time. A fixed offset
between two zones is wrong around every DST change in either of them, and for zones such as
Australia/Lord_Howe whose DST is 30 minutes.

The grid also has one hour gutter for all its columns. In the weeks when one zone has changed
offset and the other hasn't, the same line reads differently on different days.

## Decision

1. **An environment input.** `Root` takes `secondaryTimeZones`, IANA names or
   `{ timeZone, label }`, and views read them as `environment.secondaryTimeZones`, next to
   `timeZone`. It's a plain prop like `locale`, not a controlled state slice, because nothing in the
   calendar changes it. Every time-grid view gets it without per-view options. Invalid entries are
   left out and reported through `onDiagnosticsChange`, as availability's time zones are.
2. **Each line is read on its own.** `timeGridZoneTimes` resolves a line's wall time on its
   column's date in the display zone and converts each resulting instant to the other zone. A
   skipped wall time has no time and a repeated one has both, earlier first, following ADR 0016's
   cardinality. Each time carries the other zone's date as a day offset from the column's date, so
   views can mark "+1" and "−1".
3. **One gutter, honest about the days it doesn't fit.** `timeGridZoneAxis` reads the gutter's
   rows on one column: the first visible day on which neither zone changes its clocks, or else
   the first visible day that isn't a skipped date. A US week starts on the Sunday the US changes its
   clocks, so the first day would be the worst choice. The runs of lines on other columns that read
   differently are its shifts, each with its first line, the line after it (or none, to the end of
   the day) and how many minutes it differs by. Two US zones change at 02:00 local, an hour apart,
   so a run can end within the day.
4. **Pure and deterministic.** The computation lives in `calendar-core` with no React, DOM or
   formatting, and nothing reads the host's time zone or clock, so server and client agree.
5. **Decoration for sighted users, names for screen readers.** The registry draws each zone's
   hours as `aria-hidden` labels inside the existing gutter cells, as it does the display zone's
   hours. The grid keeps its columns and `aria-colindex`, and screen readers aren't walked through
   24 more labels per zone. A focused slot's accessible name adds its time in each secondary zone,
   so the information reaches screen readers where it's useful.

## Consequences

- Changing `secondaryTimeZones` creates a new environment, so the active view projects again. It's
  a settings change, not an interaction, so the cost is acceptable.
- In a week where the zones' offsets diverge mid-week, the gutter is right for its own day and
  views say which days differ; exact times on those days are in the slot names and the day view.
- Days on which neither zone changes its clocks read alike line by line, or all differ by the same
  amount, so only the days with a change are read line by line. A scrolling grid's three weeks take
  a fraction of a millisecond per zone, and about a millisecond when every visible day changes
  clocks, as a scrolling day view does on a DST day.
- The resource timeline, whose time axis is horizontal, doesn't show secondary zones yet.

## Reversal trigger

Revisit the plain prop if the calendar gains its own way to change the zones, such as a built-in
"swap zones" action: they would become a state slice with `defaultSecondaryTimeZones` and a change
handler, like `timeZone`. Revisit the shared gutter if users need exact labels for every day of a
diverging week, for example as per-column labels.
