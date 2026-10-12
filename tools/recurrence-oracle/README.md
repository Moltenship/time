# Recurrence oracle

Generates the reference fixtures for `@moltenship/calendar-recurrence`'s RRULE engine:
`packages/calendar-recurrence/tests/rule/fixtures/{rfc5545,dst,coverage}.json`, which
`tests/rule/fixtures.test.ts` runs. Expected dates come from
[python-dateutil](https://dateutil.readthedocs.io/) 2.9.0.post0, adjusted where ADR 0048 point 4
departs from it on purpose, and are checked against [ical.js](https://github.com/kewisch/ical.js)
2.2.1 as a second oracle.

This directory is not a workspace package and adds no dependency to the repository: the Python
script declares its own (PEP 723), and ical.js is installed into a temporary directory and loaded
by path.

## Regenerate

From the repository root, with [uv](https://docs.astral.sh/uv/), Node.js and npm on `PATH`:

```sh
uv run tools/recurrence-oracle/generate.py           # rewrite the three fixture files
uv run tools/recurrence-oracle/generate.py --check   # exit 1 if they're out of date
```

Without uv installed, prefix the command with `mise exec uv@latest --`. The first run downloads
Python 3.12+, python-dateutil 2.9.0.post0, tzdata 2026.5 and ical.js 2.2.1. To reuse an ical.js
2.2.1 you installed yourself (`npm install --prefix /tmp/icaljs ical.js@2.2.1`), pass
`--icaljs /tmp/icaljs`. Output is deterministic: offsets come from the pinned tzdata package only,
never the machine's zoneinfo, and the JSON is written the way `vp fmt` prints it.

The generator prints each file's case count, the cases that diverge from dateutil grouped by
reason, and the cases where ical.js disagrees. It writes nothing if any ical.js disagreement is
unexplained.

## What `expected` encodes

dateutil expands the rule as written, without COUNT and UNTIL, on the wall clock of `timeZone`.
It starts at the beginning of the period that holds DTSTART, with DTSTART's defaults written into
the rule, so the generator itself decides which dates of that first period come before the start.
Each wall time resolves like Temporal's `compatible`: a time in a gap moves forward, and a repeated
time takes its first instant. The generator then applies ADR 0048. Each rule below is a switch in
`Semantics`, so turning one off gives dateutil's answer again:

| Switch                              | ADR 0048 / RFC 5545                                                                                         |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `first_always_counts`               | The first occurrence is always one and counts toward COUNT, even when unsynchronized or after UNTIL.       |
| `nothing_before_start`              | Rule dates at or before the start instant are dropped (a later fold start, or a start written in a gap). |
| `start_compared_by_instant`         | A gap time before DTSTART's wall time that moves past the start instant is an occurrence.                 |
| `ascending_distinct`                | Starts sorted by instant with duplicates removed; COUNT takes the earliest distinct starts.                |
| `weekly_full_first_week`            | The first WEEKLY period is the whole WKST week, so BYSETPOS counts over it; dateutil's starts at DTSTART.  |
| `all_day_ignores_time_parts`        | BYHOUR, BYMINUTE and BYSECOND are ignored on all-day series.                                                |
| `byday_entries_are_alternatives`    | `BYDAY=MO,1TU` is a union; dateutil intersects plain and numbered entries.                                 |
| `yearly_weekno_takes_start_weekday` | YEARLY with BYWEEKNO and no BYDAY, BYMONTHDAY or BYYEARDAY repeats on DTSTART's weekday.                    |
| `na_parts_keep_start_day`           | N/A parts (BYWEEKNO below YEARLY, BYYEARDAY in DAILY to MONTHLY, BYMONTHDAY in WEEKLY) only filter.        |
| `rfc_week_numbers`                  | BYWEEKNO with RFC 5545 week numbering; dateutil mislabels weeks 52 and 53 and misses -52 and -53.         |
| `date_until_is_end_of_day`          | A date-only UNTIL on a floating series is the end of that day; dateutil reads midnight.                    |

The two DTSTART-default switches are also module constants (`YEARLY_WEEKNO_TAKES_DTSTART_WEEKDAY`,
`NA_PARTS_KEEP_DTSTART_DAY`), so either decision can be flipped in one place.

A start written inside a gap keeps repeating at its written wall time, which is what dateutil does.
An UNTIL of another kind is coerced as `coerceRecurrenceDate` does it. dateutil rejects some of
those UNTILs, and then its run gets the coerced value. A case whose answer differs from dateutil's
raw output carries `oracle` (dateutil's dates, same window) and `divergence`, which says why and is
built from the switches that change the answer. For anything the switches can't express, a case
can set `expected_override` with a required `override_reason`. Before a fixture is written,
dateutil's own output is checked against the generator's emulation of it (every switch off).

RFC 5545 cases also check `expected` against the RFC's printed results (`rfc_listed`). `note`
records the errata that apply.

## ical.js

ical.js has no IANA zones, so `icaljs.mjs` runs each case as floating (or all-day) on its wall
times: UTC UNTILs become wall times, and offsets are dropped. It compares that to the same case
expanded with ADR 0048 semantics as floating. That way DST resolution stays out of the comparison
and only the rule logic is compared. When they differ, the fixture gets `secondOracle` (ical.js's
wall times, or `[]` when it throws or loops) and `secondOracleNote`. Notes come from the switches
when one explains the difference. Otherwise they come from `ICALJS_NOTES`, written by hand.
