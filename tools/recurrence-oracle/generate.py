#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["python-dateutil==2.9.0.post0", "tzdata==2026.5"]
# ///
"""Reference fixtures for @moltenship/calendar-recurrence's RRULE engine.

Expands every case with python-dateutil, adjusts the result where ADR 0048 point 4 differs from
dateutil on purpose (recording dateutil's own answer and why), checks it against ical.js as a
second oracle, and writes packages/calendar-recurrence/tests/rule/fixtures/*.json.

    uv run tools/recurrence-oracle/generate.py           # write the fixtures
    uv run tools/recurrence-oracle/generate.py --check   # fail if they're out of date

See README.md beside this file.
"""

from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import heapq
import importlib.metadata
import json
import re
import shutil
import subprocess
import sys
import tempfile
import zoneinfo
from collections import defaultdict
from collections.abc import Callable, Iterator
from pathlib import Path

import dateutil
import tzdata
from dateutil import rrule as du

# Offsets come from the pinned tzdata package only, never the machine's zoneinfo, so every run
# resolves the same offsets.
zoneinfo.reset_tzpath(to=[])

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "packages/calendar-recurrence/tests/rule/fixtures"
GENERATOR = "tools/recurrence-oracle/generate.py"
ICALJS_RUNNER = Path(__file__).resolve().parent / "icaljs.mjs"
ICALJS_VERSION = "2.2.1"
TZDATA_VERSION = importlib.metadata.version("tzdata")

# Semantics item 8: FREQ=YEARLY with BYWEEKNO and none of BYDAY, BYMONTHDAY or BYYEARDAY takes the
# weekday from DTSTART. False gives dateutil's answer: every day of the listed weeks.
YEARLY_WEEKNO_TAKES_DTSTART_WEEKDAY = True
# Parts RFC 5545 calls N/A for a FREQ (BYWEEKNO below YEARLY, BYYEARDAY in DAILY, WEEKLY and
# MONTHLY, BYMONTHDAY in WEEKLY) only filter what the rest of the rule gives, DTSTART's day
# included. False gives dateutil's answer, which drops that DTSTART day when any of them is present.
NA_PARTS_KEEP_DTSTART_DAY = True

UTC = dt.UTC
ONE_DAY = dt.timedelta(days=1)
WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]  # by Python's weekday()
EVERY_WEEKDAY = ",".join(WEEKDAYS)
TIME_PARTS = ("BYHOUR", "BYMINUTE", "BYSECOND")
MAX_EXPECTED = 64
MAX_STEPS = 400_000


# ---------------------------------------------------------------------------------------------
# Cases


@dataclasses.dataclass(frozen=True)
class Case:
    id: str
    title: str
    source: str
    kind: str  # "timed" | "all-day" | "floating"
    start: str
    rule: str
    time_zone: str | None = None
    window_from: str | None = None
    window_before: str | None = None
    # RFC 5545's own list of local starts ("YYYY-MM-DDTHH:MM"), checked against `expected`.
    rfc_listed: tuple[str, ...] | None = None
    # False when `expected` must differ from `rfc_listed`, as an erratum says.
    rfc_matches: bool = True
    # Leading occurrences RFC 5545 doesn't list, such as a DTSTART its example excludes.
    rfc_unlisted: int = 0
    # Errata and other remarks on an RFC 5545 example, written to the fixture as `note`.
    rfc_note: str | None = None
    # The manual override hook: an answer that replaces the computed one, with the reason.
    expected_override: tuple[str, ...] | None = None
    override_reason: str | None = None
    # Why ical.js disagrees, for disagreements the generator can't explain itself.
    icaljs_note: str | None = None


def wall_times(year: int, month: int, days: list[int] | range, time: str = "09:00") -> list[str]:
    return [f"{year:04d}-{month:02d}-{day:02d}T{time}" for day in days]


def times_on(day: str, times: list[str]) -> list[str]:
    return [f"{day}T{time}" for time in times]


def every_day(first: str, before: str, step: int = 1, time: str = "09:00") -> list[str]:
    day, end = dt.date.fromisoformat(first), dt.date.fromisoformat(before)
    out = []
    while day < end:
        out.append(f"{day.isoformat()}T{time}")
        day += dt.timedelta(days=step)
    return out


def rfc(id: str, title: str, start: str, rule: str, listed: list[str], **extra) -> Case:
    return Case(
        id=f"rfc5545/{id}",
        title=title,
        source="RFC 5545 §3.8.5.3",
        kind="timed",
        time_zone="America/New_York",
        start=start,
        rule=rule,
        rfc_listed=tuple(listed),
        **extra,
    )


def rfc5545_cases() -> list[Case]:
    ny9 = "09:00"
    return [
        rfc(
            "daily-count-10",
            "Daily for 10 occurrences",
            "1997-09-02T09:00:00",
            "FREQ=DAILY;COUNT=10",
            wall_times(1997, 9, range(2, 12)),
        ),
        rfc(
            "daily-until-1997-12-24",
            "Daily until December 24, 1997 (from 24 October, to keep the list short)",
            "1997-09-02T09:00:00",
            "FREQ=DAILY;UNTIL=19971224T000000Z",
            every_day("1997-10-24", "1997-12-24"),
            window_from="1997-10-24T00:00:00",
            rfc_note="Erratum 6212 (rejected) asked for UNTIL=19971224T140000Z to include 24 "
            "December; UNTIL needn't be an occurrence, so the example stands.",
        ),
        rfc(
            "every-other-day",
            "Every other day, forever (to 3 December 1997)",
            "1997-09-02T09:00:00",
            "FREQ=DAILY;INTERVAL=2",
            every_day("1997-09-02", "1997-12-04", step=2),
            window_before="1997-12-04T00:00:00",
        ),
        rfc(
            "every-10-days-count-5",
            "Every 10 days, 5 occurrences",
            "1997-09-02T09:00:00",
            "FREQ=DAILY;INTERVAL=10;COUNT=5",
            wall_times(1997, 9, [2, 12, 22]) + wall_times(1997, 10, [2, 12]),
        ),
        rfc(
            "january-for-3-years-yearly",
            "Every day in January, for 3 years, as YEARLY (from 20 January 1999)",
            "1998-01-01T09:00:00",
            "FREQ=YEARLY;UNTIL=20000131T140000Z;BYMONTH=1;BYDAY=SU,MO,TU,WE,TH,FR,SA",
            wall_times(1999, 1, range(20, 32)) + wall_times(2000, 1, range(1, 32)),
            window_from="1999-01-20T00:00:00",
        ),
        rfc(
            "january-for-3-years-daily",
            "Every day in January, for 3 years, as DAILY (from 20 January 1999)",
            "1998-01-01T09:00:00",
            "FREQ=DAILY;UNTIL=20000131T140000Z;BYMONTH=1",
            wall_times(1999, 1, range(20, 32)) + wall_times(2000, 1, range(1, 32)),
            window_from="1999-01-20T00:00:00",
        ),
        rfc(
            "weekly-count-10",
            "Weekly for 10 occurrences",
            "1997-09-02T09:00:00",
            "FREQ=WEEKLY;COUNT=10",
            wall_times(1997, 9, [2, 9, 16, 23, 30])
            + wall_times(1997, 10, [7, 14, 21, 28])
            + wall_times(1997, 11, [4]),
        ),
        rfc(
            "weekly-until-1997-12-24",
            "Weekly until December 24, 1997",
            "1997-09-02T09:00:00",
            "FREQ=WEEKLY;UNTIL=19971224T000000Z",
            every_day("1997-09-02", "1997-12-24", step=7),
        ),
        rfc(
            "every-other-week",
            "Every other week, forever (to 17 February 1998)",
            "1997-09-02T09:00:00",
            "FREQ=WEEKLY;INTERVAL=2;WKST=SU",
            every_day("1997-09-02", "1998-02-18", step=14),
            window_before="1998-02-18T00:00:00",
        ),
        rfc(
            "weekly-tu-th-five-weeks-until",
            "Weekly on Tuesday and Thursday for five weeks, with UNTIL",
            "1997-09-02T09:00:00",
            "FREQ=WEEKLY;UNTIL=19971007T000000Z;WKST=SU;BYDAY=TU,TH",
            wall_times(1997, 9, [2, 4, 9, 11, 16, 18, 23, 25, 30]) + wall_times(1997, 10, [2]),
            rfc_note="Erratum 5872 (rejected) asked for UNTIL=19971002T000000Z; 7 October 00:00Z "
            "is before that day's 09:00 EDT, so the example stands.",
        ),
        rfc(
            "weekly-tu-th-five-weeks-count",
            "Weekly on Tuesday and Thursday for five weeks, with COUNT",
            "1997-09-02T09:00:00",
            "FREQ=WEEKLY;COUNT=10;WKST=SU;BYDAY=TU,TH",
            wall_times(1997, 9, [2, 4, 9, 11, 16, 18, 23, 25, 30]) + wall_times(1997, 10, [2]),
        ),
        rfc(
            "every-other-week-mo-we-fr-until",
            "Every other week on Monday, Wednesday and Friday until December 24, 1997",
            "1997-09-01T09:00:00",
            "FREQ=WEEKLY;INTERVAL=2;UNTIL=19971224T000000Z;WKST=SU;BYDAY=MO,WE,FR",
            wall_times(1997, 9, [1, 3, 5, 15, 17, 19, 29])
            + wall_times(1997, 10, [1, 3, 13, 15, 17, 27, 29, 31])
            + wall_times(1997, 11, [10, 12, 14, 24, 26, 28])
            + wall_times(1997, 12, [8, 10, 12, 22]),
        ),
        rfc(
            "every-other-week-tu-th-count-8",
            "Every other week on Tuesday and Thursday, for 8 occurrences",
            "1997-09-02T09:00:00",
            "FREQ=WEEKLY;INTERVAL=2;COUNT=8;WKST=SU;BYDAY=TU,TH",
            wall_times(1997, 9, [2, 4, 16, 18, 30]) + wall_times(1997, 10, [2, 14, 16]),
        ),
        rfc(
            "monthly-first-friday-count-10",
            "Monthly on the first Friday for 10 occurrences",
            "1997-09-05T09:00:00",
            "FREQ=MONTHLY;COUNT=10;BYDAY=1FR",
            wall_times(1997, 9, [5])
            + wall_times(1997, 10, [3])
            + wall_times(1997, 11, [7])
            + wall_times(1997, 12, [5])
            + wall_times(1998, 1, [2])
            + wall_times(1998, 2, [6])
            + wall_times(1998, 3, [6])
            + wall_times(1998, 4, [3])
            + wall_times(1998, 5, [1])
            + wall_times(1998, 6, [5]),
        ),
        rfc(
            "monthly-first-friday-until",
            "Monthly on the first Friday until December 24, 1997",
            "1997-09-05T09:00:00",
            "FREQ=MONTHLY;UNTIL=19971224T000000Z;BYDAY=1FR",
            wall_times(1997, 9, [5])
            + wall_times(1997, 10, [3])
            + wall_times(1997, 11, [7])
            + wall_times(1997, 12, [5]),
        ),
        rfc(
            "every-other-month-first-last-sunday",
            "Every other month on the first and last Sunday of the month for 10 occurrences",
            "1997-09-07T09:00:00",
            "FREQ=MONTHLY;INTERVAL=2;COUNT=10;BYDAY=1SU,-1SU",
            wall_times(1997, 9, [7, 28])
            + wall_times(1997, 11, [2, 30])
            + wall_times(1998, 1, [4, 25])
            + wall_times(1998, 3, [1, 29])
            + wall_times(1998, 5, [3, 31]),
        ),
        rfc(
            "monthly-second-to-last-monday",
            "Monthly on the second-to-last Monday of the month for 6 months",
            "1997-09-22T09:00:00",
            "FREQ=MONTHLY;COUNT=6;BYDAY=-2MO",
            wall_times(1997, 9, [22])
            + wall_times(1997, 10, [20])
            + wall_times(1997, 11, [17])
            + wall_times(1997, 12, [22])
            + wall_times(1998, 1, [19])
            + wall_times(1998, 2, [16]),
        ),
        rfc(
            "monthly-third-to-last-day",
            "Monthly on the third-to-the-last day of the month, forever (to February 1998)",
            "1997-09-28T09:00:00",
            "FREQ=MONTHLY;BYMONTHDAY=-3",
            wall_times(1997, 9, [28])
            + wall_times(1997, 10, [29])
            + wall_times(1997, 11, [28])
            + wall_times(1997, 12, [29])
            + wall_times(1998, 1, [29])
            + wall_times(1998, 2, [26]),
            window_before="1998-03-01T00:00:00",
        ),
        rfc(
            "monthly-2nd-and-15th",
            "Monthly on the 2nd and 15th of the month for 10 occurrences",
            "1997-09-02T09:00:00",
            "FREQ=MONTHLY;COUNT=10;BYMONTHDAY=2,15",
            [t for m in (9, 10, 11, 12) for t in wall_times(1997, m, [2, 15])]
            + wall_times(1998, 1, [2, 15]),
        ),
        rfc(
            "monthly-first-and-last-day",
            "Monthly on the first and last day of the month for 10 occurrences",
            "1997-09-30T09:00:00",
            "FREQ=MONTHLY;COUNT=10;BYMONTHDAY=1,-1",
            wall_times(1997, 9, [30])
            + wall_times(1997, 10, [1, 31])
            + wall_times(1997, 11, [1, 30])
            + wall_times(1997, 12, [1, 31])
            + wall_times(1998, 1, [1, 31])
            + wall_times(1998, 2, [1]),
        ),
        rfc(
            "every-18-months-10th-to-15th",
            "Every 18 months on the 10th thru 15th of the month for 10 occurrences",
            "1997-09-10T09:00:00",
            "FREQ=MONTHLY;INTERVAL=18;COUNT=10;BYMONTHDAY=10,11,12,13,14,15",
            wall_times(1997, 9, range(10, 16)) + wall_times(1999, 3, range(10, 14)),
        ),
        rfc(
            "every-tuesday-every-other-month",
            "Every Tuesday, every other month (to March 1998)",
            "1997-09-02T09:00:00",
            "FREQ=MONTHLY;INTERVAL=2;BYDAY=TU",
            wall_times(1997, 9, [2, 9, 16, 23, 30])
            + wall_times(1997, 11, [4, 11, 18, 25])
            + wall_times(1998, 1, [6, 13, 20, 27])
            + wall_times(1998, 3, [3, 10, 17, 24, 31]),
            window_before="1998-04-01T00:00:00",
        ),
        rfc(
            "yearly-june-july",
            "Yearly in June and July for 10 occurrences",
            "1997-06-10T09:00:00",
            "FREQ=YEARLY;COUNT=10;BYMONTH=6,7",
            [f"{y}-{m}-10T{ny9}" for y in range(1997, 2002) for m in ("06", "07")],
        ),
        rfc(
            "every-other-year-jan-feb-mar",
            "Every other year on January, February, and March for 10 occurrences",
            "1997-03-10T09:00:00",
            "FREQ=YEARLY;INTERVAL=2;COUNT=10;BYMONTH=1,2,3",
            [f"1997-03-10T{ny9}"]
            + [f"{y}-{m}-10T{ny9}" for y in (1999, 2001, 2003) for m in ("01", "02", "03")],
        ),
        rfc(
            "every-third-year-yeardays",
            "Every third year on the 1st, 100th, and 200th day for 10 occurrences",
            "1997-01-01T09:00:00",
            "FREQ=YEARLY;INTERVAL=3;COUNT=10;BYYEARDAY=1,100,200",
            [
                f"{d}T{ny9}"
                for d in (
                    "1997-01-01",
                    "1997-04-10",
                    "1997-07-19",
                    "2000-01-01",
                    "2000-04-09",
                    "2000-07-18",
                    "2003-01-01",
                    "2003-04-10",
                    "2003-07-19",
                    "2006-01-01",
                )
            ],
        ),
        rfc(
            "every-20th-monday",
            "Every 20th Monday of the year, forever (to 1999)",
            "1997-05-19T09:00:00",
            "FREQ=YEARLY;BYDAY=20MO",
            [f"{d}T{ny9}" for d in ("1997-05-19", "1998-05-18", "1999-05-17")],
            window_before="2000-01-01T00:00:00",
        ),
        rfc(
            "monday-of-week-20",
            "Monday of week number 20, forever (to 1999)",
            "1997-05-12T09:00:00",
            "FREQ=YEARLY;BYWEEKNO=20;BYDAY=MO",
            [f"{d}T{ny9}" for d in ("1997-05-12", "1998-05-11", "1999-05-17")],
            window_before="2000-01-01T00:00:00",
        ),
        rfc(
            "every-thursday-in-march",
            "Every Thursday in March, forever (to 1999)",
            "1997-03-13T09:00:00",
            "FREQ=YEARLY;BYMONTH=3;BYDAY=TH",
            wall_times(1997, 3, [13, 20, 27])
            + wall_times(1998, 3, [5, 12, 19, 26])
            + wall_times(1999, 3, [4, 11, 18, 25]),
            window_before="2000-01-01T00:00:00",
        ),
        rfc(
            "every-thursday-june-to-august",
            "Every Thursday, but only during June, July, and August, forever (to 1999)",
            "1997-06-05T09:00:00",
            "FREQ=YEARLY;BYDAY=TH;BYMONTH=6,7,8",
            wall_times(1997, 6, [5, 12, 19, 26])
            + wall_times(1997, 7, [3, 10, 17, 24, 31])
            + wall_times(1997, 8, [7, 14, 21, 28])
            + wall_times(1998, 6, [4, 11, 18, 25])
            + wall_times(1998, 7, [2, 9, 16, 23, 30])
            + wall_times(1998, 8, [6, 13, 20, 27])
            + wall_times(1999, 6, [3, 10, 17, 24])
            + wall_times(1999, 7, [1, 8, 15, 22, 29])
            + wall_times(1999, 8, [5, 12, 19, 26]),
            window_before="2000-01-01T00:00:00",
        ),
        rfc(
            "every-friday-13th",
            "Every Friday the 13th, forever (to 2000)",
            "1997-09-02T09:00:00",
            "FREQ=MONTHLY;BYDAY=FR;BYMONTHDAY=13",
            [
                f"{d}T{ny9}"
                for d in (
                    "1998-02-13",
                    "1998-03-13",
                    "1998-11-13",
                    "1999-08-13",
                    "2000-10-13",
                )
            ],
            window_before="2001-01-01T00:00:00",
            rfc_unlisted=1,
            rfc_note="The RFC's example also has EXDATE;TZID=America/New_York:19970902T090000, which "
            "takes the unsynchronized DTSTART out; a rule fixture has no EXDATE, so the first "
            "occurrence stays and the RFC's list follows it. Erratum 5920 (rejected) asked to "
            "move DTSTART onto 13 February 1998.",
        ),
        rfc(
            "first-saturday-after-first-sunday",
            "The first Saturday that follows the first Sunday of the month (to June 1998)",
            "1997-09-13T09:00:00",
            "FREQ=MONTHLY;BYDAY=SA;BYMONTHDAY=7,8,9,10,11,12,13",
            [
                f"{d}T{ny9}"
                for d in (
                    "1997-09-13",
                    "1997-10-11",
                    "1997-11-08",
                    "1997-12-13",
                    "1998-01-10",
                    "1998-02-07",
                    "1998-03-07",
                    "1998-04-11",
                    "1998-05-09",
                    "1998-06-13",
                )
            ],
            window_before="1998-07-01T00:00:00",
        ),
        rfc(
            "us-presidential-election-day",
            "Every 4 years, the first Tuesday after a Monday in November (to 2004)",
            "1996-11-05T09:00:00",
            "FREQ=YEARLY;INTERVAL=4;BYMONTH=11;BYDAY=TU;BYMONTHDAY=2,3,4,5,6,7,8",
            [f"{d}T{ny9}" for d in ("1996-11-05", "2000-11-07", "2004-11-02")],
            window_before="2005-01-01T00:00:00",
        ),
        rfc(
            "third-tuesday-wednesday-or-thursday",
            "The third instance into the month of one of Tuesday, Wednesday, or Thursday, for the "
            "next 3 months",
            "1997-09-04T09:00:00",
            "FREQ=MONTHLY;COUNT=3;BYDAY=TU,WE,TH;BYSETPOS=3",
            [f"{d}T{ny9}" for d in ("1997-09-04", "1997-10-07", "1997-11-06")],
        ),
        rfc(
            "second-to-last-weekday",
            "The second-to-last weekday of the month (to March 1998)",
            "1997-09-29T09:00:00",
            "FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-2",
            [
                f"{d}T{ny9}"
                for d in (
                    "1997-09-29",
                    "1997-10-30",
                    "1997-11-27",
                    "1997-12-30",
                    "1998-01-29",
                    "1998-02-26",
                    "1998-03-30",
                )
            ],
            window_before="1998-04-01T00:00:00",
        ),
        rfc(
            "every-3-hours-until",
            "Every 3 hours from 9:00 AM to 5:00 PM on a specific day, as printed",
            "1997-09-02T09:00:00",
            "FREQ=HOURLY;INTERVAL=3;UNTIL=19970902T170000Z",
            times_on("1997-09-02", ["09:00", "12:00", "15:00"]),
            rfc_matches=False,
            rfc_note="Verified erratum 3883: 19970902T170000Z is 13:00 EDT, so the rule as printed "
            "stops after 12:00; the RFC's 15:00 needs UNTIL=19970902T210000Z "
            "(rfc5545/every-3-hours-until-erratum-3883).",
        ),
        rfc(
            "every-3-hours-until-erratum-3883",
            "Every 3 hours from 9:00 AM to 5:00 PM on a specific day, with erratum 3883's UNTIL",
            "1997-09-02T09:00:00",
            "FREQ=HOURLY;INTERVAL=3;UNTIL=19970902T210000Z",
            times_on("1997-09-02", ["09:00", "12:00", "15:00"]),
        ),
        rfc(
            "every-15-minutes-count-6",
            "Every 15 minutes for 6 occurrences",
            "1997-09-02T09:00:00",
            "FREQ=MINUTELY;INTERVAL=15;COUNT=6",
            times_on("1997-09-02", ["09:00", "09:15", "09:30", "09:45", "10:00", "10:15"]),
        ),
        rfc(
            "every-90-minutes-count-4",
            "Every hour and a half for 4 occurrences",
            "1997-09-02T09:00:00",
            "FREQ=MINUTELY;INTERVAL=90;COUNT=4",
            times_on("1997-09-02", ["09:00", "10:30", "12:00", "13:30"]),
        ),
        rfc(
            "every-20-minutes-daily",
            "Every 20 minutes from 9:00 AM to 4:40 PM every day, as DAILY (two days)",
            "1997-09-02T09:00:00",
            "FREQ=DAILY;BYHOUR=9,10,11,12,13,14,15,16;BYMINUTE=0,20,40",
            [
                f"{d}T{h:02d}:{m:02d}"
                for d in ("1997-09-02", "1997-09-03")
                for h in range(9, 17)
                for m in (0, 20, 40)
            ],
            window_before="1997-09-04T00:00:00",
        ),
        rfc(
            "every-20-minutes-minutely",
            "Every 20 minutes from 9:00 AM to 4:40 PM every day, as MINUTELY (two days)",
            "1997-09-02T09:00:00",
            "FREQ=MINUTELY;INTERVAL=20;BYHOUR=9,10,11,12,13,14,15,16",
            [
                f"{d}T{h:02d}:{m:02d}"
                for d in ("1997-09-02", "1997-09-03")
                for h in range(9, 17)
                for m in (0, 20, 40)
            ],
            window_before="1997-09-04T00:00:00",
        ),
        rfc(
            "wkst-monday",
            "Days generated depend on WKST: WKST=MO",
            "1997-08-05T09:00:00",
            "FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=MO",
            wall_times(1997, 8, [5, 10, 19, 24]),
        ),
        rfc(
            "wkst-sunday",
            "Days generated depend on WKST: WKST=SU",
            "1997-08-05T09:00:00",
            "FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=SU",
            wall_times(1997, 8, [5, 17, 19, 31]),
        ),
        rfc(
            "invalid-date-ignored",
            "An invalid date (February 30) is ignored",
            "2007-01-15T09:00:00",
            "FREQ=MONTHLY;BYMONTHDAY=15,30;COUNT=5",
            wall_times(2007, 1, [15, 30])
            + wall_times(2007, 2, [15])
            + wall_times(2007, 3, [15, 30]),
        ),
    ]


@dataclasses.dataclass(frozen=True)
class DstZone:
    slug: str
    name: str
    gap: str  # first wall time that doesn't exist
    gap_minutes: int
    gap_byday: str  # the BYDAY entry naming the gap's day in its month
    fold: str  # first wall time that happens twice
    fold_minutes: int
    fold_byday: str


# fmt: off
DST_ZONES = [
    DstZone("europe-berlin", "Europe/Berlin", "2026-03-29T02:00", 60, "-1SU", "2026-10-25T02:00", 60, "-1SU"),
    DstZone("america-new-york", "America/New_York", "2025-03-09T02:00", 60, "2SU", "2025-11-02T01:00", 60, "1SU"),
    DstZone("australia-lord-howe", "Australia/Lord_Howe", "2026-10-04T02:00", 30, "1SU", "2026-04-05T01:30", 30, "1SU"),
    DstZone("america-santiago", "America/Santiago", "2027-09-05T00:00", 60, "1SU", "2027-04-03T23:00", 60, "1SA"),
    DstZone("australia-sydney", "Australia/Sydney", "2026-10-04T02:00", 60, "1SU", "2026-04-05T02:00", 60, "1SU"),
]
# fmt: on


def iso(wall: dt.datetime) -> str:
    return wall.isoformat(timespec="seconds")


def hhmm(wall: dt.datetime) -> str:
    return wall.strftime("%H:%M")


def utc_text(instant: dt.datetime) -> str:
    return instant.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")


def nth_weekday(year: int, month: int, byday: str) -> dt.date:
    """The day a BYDAY entry such as 2SU or -1SU names in a month."""
    ordinal, weekday = int(byday[:-2]), WEEKDAYS.index(byday[-2:])
    days = [
        dt.date(year, month, d)
        for d in range(1, 32)
        if _valid(year, month, d) and dt.date(year, month, d).weekday() == weekday
    ]
    return days[ordinal - 1] if ordinal > 0 else days[ordinal]


def _valid(year: int, month: int, day: int) -> bool:
    try:
        dt.date(year, month, day)
    except ValueError:
        return False
    return True


def add_months(day: dt.date, months: int) -> tuple[int, int]:
    index = day.year * 12 + day.month - 1 + months
    return index // 12, index % 12 + 1


def check_zone(zone: DstZone) -> None:
    """The table above must describe the pinned tzdata, or every DST case would be off."""
    tz = zoneinfo.ZoneInfo(zone.name)

    def resolves(wall: dt.datetime, fold: int) -> dt.datetime:
        return wall.replace(tzinfo=tz, fold=fold).astimezone(UTC)

    def exists(wall: dt.datetime) -> bool:
        return resolves(wall, 0).astimezone(tz).replace(tzinfo=None) == wall

    gap, fold = dt.datetime.fromisoformat(zone.gap), dt.datetime.fromisoformat(zone.fold)
    minute = dt.timedelta(minutes=1)
    assert exists(gap - minute) and not exists(gap), zone
    assert not exists(gap + dt.timedelta(minutes=zone.gap_minutes) - minute), zone
    assert exists(gap + dt.timedelta(minutes=zone.gap_minutes)), zone
    assert resolves(fold - minute, 0) == resolves(fold - minute, 1), zone
    assert resolves(fold, 0) != resolves(fold, 1), zone
    end = fold + dt.timedelta(minutes=zone.fold_minutes)
    assert resolves(end - minute, 0) != resolves(end - minute, 1), zone
    assert resolves(end, 0) == resolves(end, 1), zone
    assert nth_weekday(gap.year, gap.month, zone.gap_byday) == gap.date(), zone
    assert nth_weekday(fold.year, fold.month, zone.fold_byday) == fold.date(), zone


def dst_cases_for(zone: DstZone) -> list[Case]:
    check_zone(zone)
    tz = zoneinfo.ZoneInfo(zone.name)
    gap = dt.datetime.fromisoformat(zone.gap)
    fold = dt.datetime.fromisoformat(zone.fold)
    gap_length = dt.timedelta(minutes=zone.gap_minutes)
    fold_length = dt.timedelta(minutes=zone.fold_minutes)
    in_gap = gap + gap_length / 2
    in_fold = fold + fold_length / 2
    minutes = lambda n: dt.timedelta(minutes=n)  # noqa: E731
    hours = lambda n: dt.timedelta(hours=n)  # noqa: E731
    gap_text = f"{gap:%Y-%m-%d}, {hhmm(gap)}→{hhmm(gap + gap_length)}"
    fold_text = f"{fold:%Y-%m-%d}, {hhmm(fold + fold_length)}→{hhmm(fold)}"
    later = in_fold.replace(tzinfo=tz, fold=1)
    later_text = iso(in_fold) + later.isoformat()[-6:]

    def case(slug: str, title: str, start: dt.datetime | str, rule: str, **window) -> Case:
        return Case(
            id=f"dst/{zone.slug}/{slug}",
            title=title,
            source="DST matrix",
            kind="timed",
            time_zone=zone.name,
            start=start if isinstance(start, str) else iso(start),
            rule=rule,
            window_from=iso(window["from_"]) if "from_" in window else None,
            window_before=iso(window["before"]) if "before" in window else None,
        )

    def by_hours(at: dt.datetime) -> str:
        return ",".join(str(h) for h in sorted({(at.hour + d) % 24 for d in (-1, 0, 1)}))

    def monthly_start(at: dt.datetime, byday: str) -> dt.datetime:
        year, month = add_months(at.date(), -2)
        return dt.datetime.combine(nth_weekday(year, month, byday), at.time())

    # The step that makes a wall time moved out of the gap land after a real later one.
    reorder_step = 45 if zone.gap_minutes == 60 else 20
    reorder_count = 3 if zone.gap_minutes == 60 else 2
    duplicate_rule = (
        "FREQ=HOURLY" if zone.gap_minutes == 60 else f"FREQ=MINUTELY;INTERVAL={zone.gap_minutes}"
    )
    duplicate_step = minutes(zone.gap_minutes)
    fold_day_after = dt.datetime.combine(fold.date() + ONE_DAY, dt.time())
    gap_day_after = dt.datetime.combine(gap.date() + ONE_DAY, dt.time())

    cases = [
        case(
            "daily-in-gap",
            f"DAILY at {hhmm(in_gap)}, which the gap ({gap_text}) moves forward",
            in_gap - 2 * ONE_DAY,
            "FREQ=DAILY;COUNT=5",
        ),
        case(
            "daily-in-fold",
            f"DAILY at {hhmm(in_fold)}, which the fold ({fold_text}) repeats; the first instant counts",
            in_fold - 2 * ONE_DAY,
            "FREQ=DAILY;COUNT=5",
        ),
        case(
            "weekly-across-gap",
            f"WEEKLY at {hhmm(in_gap)} across the gap ({gap_text})",
            in_gap - 14 * ONE_DAY,
            "FREQ=WEEKLY;COUNT=4",
        ),
        case(
            "weekly-across-fold",
            f"WEEKLY on two days at {hhmm(in_fold)} across the fold ({fold_text})",
            in_fold - 8 * ONE_DAY,
            f"FREQ=WEEKLY;BYDAY={WEEKDAYS[(fold.weekday() - 1) % 7]},{WEEKDAYS[fold.weekday()]};COUNT=6",
        ),
        case(
            "monthly-across-gap",
            f"MONTHLY on the gap's day ({zone.gap_byday}) at {hhmm(in_gap)}, across the gap ({gap_text})",
            monthly_start(in_gap, zone.gap_byday),
            f"FREQ=MONTHLY;BYDAY={zone.gap_byday};COUNT=4",
        ),
        case(
            "monthly-across-fold",
            f"MONTHLY on the fold's day ({zone.fold_byday}) at {hhmm(in_fold)}, across the fold ({fold_text})",
            monthly_start(in_fold, zone.fold_byday),
            f"FREQ=MONTHLY;BYDAY={zone.fold_byday};COUNT=4",
        ),
        case(
            "hourly-across-gap",
            f"HOURLY across the gap ({gap_text})",
            gap - hours(2),
            "FREQ=HOURLY",
            before=gap + gap_length + hours(2),
        ),
        case(
            "hourly-across-fold",
            f"HOURLY across the fold ({fold_text}); the wall clock skips the repeated hour's second instants",
            fold - hours(2),
            "FREQ=HOURLY",
            before=fold + fold_length + hours(2),
        ),
        case(
            "minutely-15-across-gap",
            f"Every 15 minutes across the gap ({gap_text})",
            gap - minutes(30),
            "FREQ=MINUTELY;INTERVAL=15",
            before=gap + gap_length + minutes(45),
        ),
        case(
            "minutely-45-across-gap",
            f"Every 45 minutes across the gap ({gap_text})",
            gap - minutes(45),
            "FREQ=MINUTELY;INTERVAL=45",
            before=gap + gap_length + minutes(90),
        ),
        case(
            "minutely-15-across-fold",
            f"Every 15 minutes across the fold ({fold_text})",
            fold - minutes(30),
            "FREQ=MINUTELY;INTERVAL=15",
            before=fold + fold_length + minutes(30),
        ),
        case(
            "minutely-45-across-fold",
            f"Every 45 minutes across the fold ({fold_text})",
            fold - minutes(45),
            "FREQ=MINUTELY;INTERVAL=45",
            before=fold + fold_length + minutes(90),
        ),
        case(
            "byhour-byminute-on-gap-day",
            f"DAILY;BYHOUR={by_hours(gap)};BYMINUTE=0,30 on the day before and the day of the gap ({gap_text})",
            dt.datetime.combine(gap.date() - ONE_DAY, dt.time(int(by_hours(gap).split(",")[0]))),
            f"FREQ=DAILY;BYHOUR={by_hours(gap)};BYMINUTE=0,30",
            before=gap_day_after,
        ),
        case(
            "byhour-byminute-on-fold-day",
            f"DAILY;BYHOUR={by_hours(fold)};BYMINUTE=0,30 on the day before and the day of the fold ({fold_text})",
            dt.datetime.combine(fold.date() - ONE_DAY, dt.time(int(by_hours(fold).split(",")[0]))),
            f"FREQ=DAILY;BYHOUR={by_hours(fold)};BYMINUTE=0,30",
            before=fold_day_after,
        ),
        case(
            "start-in-gap-daily",
            f"DAILY from {hhmm(in_gap)} written inside the gap ({gap_text}): the first occurrence "
            "moves forward, later ones keep the written time",
            in_gap,
            "FREQ=DAILY;COUNT=4",
        ),
        case(
            "start-in-gap-minutely-15",
            f"Every 15 minutes from {hhmm(in_gap)} written inside the gap ({gap_text}): nothing "
            "comes before the moved first occurrence",
            in_gap,
            "FREQ=MINUTELY;INTERVAL=15",
            before=gap + gap_length + minutes(75),
        ),
        case(
            "start-in-fold-earlier-daily",
            f"DAILY from {hhmm(in_fold)} inside the fold ({fold_text}), the earlier instant",
            in_fold,
            "FREQ=DAILY;COUNT=3",
        ),
        case(
            "start-in-fold-later-daily",
            f"DAILY from {hhmm(in_fold)} inside the fold ({fold_text}), the later instant",
            later_text,
            "FREQ=DAILY;COUNT=3",
        ),
        case(
            "start-in-fold-later-hourly",
            f"HOURLY from the later {hhmm(in_fold)} of the fold ({fold_text})",
            later_text,
            "FREQ=HOURLY",
            before=fold + fold_length + hours(2),
        ),
        case(
            "count-gap-duplicate",
            f"COUNT=5 every {zone.gap_minutes} minutes across the gap ({gap_text}): a moved time "
            "lands on a real one and counts once",
            gap - 2 * duplicate_step,
            f"{duplicate_rule};COUNT=5",
        ),
        case(
            "count-reordered-gap",
            f"COUNT={reorder_count} every {reorder_step} minutes across the gap ({gap_text}): COUNT "
            "takes the earliest starts, not the first wall times",
            gap - minutes(45 if reorder_step == 45 else 10),
            f"FREQ=MINUTELY;INTERVAL={reorder_step};COUNT={reorder_count}",
        ),
        case(
            "until-at-fold",
            f"DAILY at {hhmm(in_fold)} until exactly the fold's first {hhmm(in_fold)} ({fold_text})",
            in_fold - 3 * ONE_DAY,
            "FREQ=DAILY;UNTIL=" + utc_text(in_fold.replace(tzinfo=tz, fold=0)),
        ),
        case(
            "until-inside-fold",
            f"HOURLY until the second {hhmm(fold)} of the fold ({fold_text})",
            fold - hours(2),
            "FREQ=HOURLY;UNTIL=" + utc_text(fold.replace(tzinfo=tz, fold=1)),
        ),
    ]
    if reorder_step != 45:
        cases.insert(
            10,
            case(
                f"minutely-{reorder_step}-across-gap",
                f"Every {reorder_step} minutes across the gap ({gap_text}): a moved time lands "
                "after a real later one",
                gap - minutes(10),
                f"FREQ=MINUTELY;INTERVAL={reorder_step}",
                before=gap + gap_length + minutes(50),
            ),
        )
    return cases


def dst_cases() -> list[Case]:
    def plain(zone: str, slug: str, title: str, start: str, rule: str, before: str | None = None):
        return Case(
            id=f"dst/{slug}",
            title=title,
            source="DST matrix",
            kind="timed",
            time_zone=zone,
            start=start,
            rule=rule,
            window_before=before,
        )

    # Gap times whose wall time is before DTSTART's but whose instant is after it.
    after_start = {
        "europe-berlin": [
            plain(
                "Europe/Berlin",
                "europe-berlin/start-after-gap-daily-byhour",
                "DAILY;BYHOUR=2;BYMINUTE=30 from 03:00 on the gap day (2026-03-29, 02:00→03:00): "
                "02:30 moves to 03:30, after the start",
                "2026-03-29T03:00:00",
                "FREQ=DAILY;BYHOUR=2;BYMINUTE=30;COUNT=3",
            ),
        ],
        "australia-lord-howe": [
            plain(
                "Australia/Lord_Howe",
                "australia-lord-howe/start-at-gap-end-hourly-byminute",
                "HOURLY;BYMINUTE=15,18 from 02:30, the end of the gap (2001-10-28, 02:00→02:30): "
                "02:15 and 02:18 move past the start",
                "2001-10-28T02:30:00",
                "FREQ=HOURLY;BYMINUTE=15,18",
                "2001-10-28T05:00:00",
            ),
            plain(
                "Australia/Lord_Howe",
                "australia-lord-howe/start-at-gap-end-daily-byminute",
                "DAILY;BYHOUR=2;BYMINUTE=15,30 from 02:30, the end of the gap (2026-10-04, "
                "02:00→02:30): the start is a rule date and 02:15 moves past it",
                "2026-10-04T02:30:00",
                "FREQ=DAILY;BYHOUR=2;BYMINUTE=15,30;COUNT=5",
            ),
        ],
    }
    cases = [
        case for zone in DST_ZONES for case in dst_cases_for(zone) + after_start.get(zone.slug, [])
    ]

    return cases + [
        plain(
            "Asia/Kolkata",
            "asia-kolkata/daily",
            "DAILY in a zone without DST",
            "2026-03-27T09:00:00",
            "FREQ=DAILY;COUNT=5",
        ),
        plain(
            "Asia/Kolkata",
            "asia-kolkata/hourly",
            "HOURLY across midnight in a zone without DST",
            "2026-10-24T22:00:00",
            "FREQ=HOURLY;COUNT=5",
        ),
        plain(
            "Asia/Kolkata",
            "asia-kolkata/minutely-45",
            "Every 45 minutes in a zone without DST",
            "2026-03-29T01:15:00",
            "FREQ=MINUTELY;INTERVAL=45",
            "2026-03-29T04:30:00",
        ),
        plain("UTC", "utc/daily", "DAILY in UTC", "2026-03-27T02:30:00", "FREQ=DAILY;COUNT=5"),
        plain(
            "UTC",
            "utc/hourly",
            "HOURLY across midnight in UTC",
            "2026-10-24T22:00:00",
            "FREQ=HOURLY;COUNT=5",
        ),
        plain(
            "UTC",
            "utc/minutely-45",
            "Every 45 minutes in UTC",
            "2026-03-29T01:15:00",
            "FREQ=MINUTELY;INTERVAL=45",
            "2026-03-29T04:30:00",
        ),
    ]


# Coverage: (slug, title, kind, start, rule, window) with kind "utc", "zone" (Europe/Berlin),
# "floating" or "all-day"; window is None, a before, or (from, before).
COVERAGE_ZONE = "Europe/Berlin"


def coverage_cases() -> list[Case]:
    # fmt: off
    rows: list[tuple] = [
        # SECONDLY
        ("secondly/count", "SECONDLY with COUNT", "utc", "2026-01-10T09:00:00", "FREQ=SECONDLY;COUNT=5", None),
        ("secondly/interval", "SECONDLY every 15 seconds", "zone", "2026-01-10T09:00:00", "FREQ=SECONDLY;INTERVAL=15;COUNT=6", None),
        ("secondly/until-floating", "SECONDLY every 10 seconds until a local time", "floating", "2026-01-10T09:00:00", "FREQ=SECONDLY;INTERVAL=10;UNTIL=20260110T090100", None),
        ("secondly/until-utc", "SECONDLY every 20 seconds until a UTC time", "zone", "2026-01-10T09:00:00", "FREQ=SECONDLY;INTERVAL=20;UNTIL=20260110T080100Z", None),
        ("secondly/byhour-byminute-limit", "SECONDLY limited by BYHOUR and BYMINUTE, from an unsynchronized start", "utc", "2026-01-10T09:59:00", "FREQ=SECONDLY;INTERVAL=20;BYHOUR=10;BYMINUTE=0", "2026-01-10T10:02:00"),
        ("secondly/bysecond-limit", "SECONDLY limited by BYSECOND", "floating", "2026-01-10T09:00:00", "FREQ=SECONDLY;BYSECOND=0,30;COUNT=5", None),
        ("secondly/bysetpos", "SECONDLY with BYSETPOS (each period has one second)", "utc", "2026-01-10T09:00:00", "FREQ=SECONDLY;INTERVAL=30;BYSETPOS=1;COUNT=3", None),
        # MINUTELY
        ("minutely/count", "MINUTELY with COUNT", "utc", "2026-01-10T09:00:00", "FREQ=MINUTELY;COUNT=4", None),
        ("minutely/interval-until", "MINUTELY every 25 minutes until a UTC time", "zone", "2026-01-10T09:00:00", "FREQ=MINUTELY;INTERVAL=25;UNTIL=20260110T100000Z", None),
        ("minutely/until-floating", "MINUTELY every 20 minutes until a local time", "floating", "2026-01-10T23:00:00", "FREQ=MINUTELY;INTERVAL=20;UNTIL=20260111T000000", None),
        ("minutely/bysecond-expand", "MINUTELY expanded by BYSECOND", "floating", "2026-01-10T09:00:00", "FREQ=MINUTELY;BYSECOND=0,20,40;COUNT=7", None),
        ("minutely/byhour-limit", "MINUTELY every 30 minutes limited by BYHOUR", "utc", "2026-01-10T09:00:00", "FREQ=MINUTELY;INTERVAL=30;BYHOUR=9,10;COUNT=6", None),
        ("minutely/byday-limit", "MINUTELY every 12 hours limited by BYDAY", "floating", "2026-01-09T09:00:00", "FREQ=MINUTELY;INTERVAL=720;BYDAY=MO,FR;COUNT=6", None),
        ("minutely/byminute-limit", "MINUTELY limited by BYMINUTE", "zone", "2026-01-10T09:00:00", "FREQ=MINUTELY;INTERVAL=5;BYMINUTE=0,10,55;COUNT=6", None),
        # HOURLY
        ("hourly/count", "HOURLY with COUNT", "utc", "2026-01-10T22:00:00", "FREQ=HOURLY;COUNT=4", None),
        ("hourly/interval", "HOURLY every 5 hours across midnight", "zone", "2026-01-10T09:00:00", "FREQ=HOURLY;INTERVAL=5;COUNT=6", None),
        ("hourly/until-floating", "HOURLY until a local time", "floating", "2026-01-10T20:00:00", "FREQ=HOURLY;INTERVAL=2;UNTIL=20260111T040000", None),
        ("hourly/byminute-expand", "HOURLY expanded by BYMINUTE", "utc", "2026-01-10T09:00:00", "FREQ=HOURLY;BYMINUTE=0,15,45;COUNT=7", None),
        ("hourly/bysecond-expand", "HOURLY expanded by BYSECOND", "floating", "2026-01-10T09:00:00", "FREQ=HOURLY;BYSECOND=0,30;COUNT=5", None),
        ("hourly/byhour-limit", "HOURLY every 3 hours limited by BYHOUR", "zone", "2026-01-10T09:00:00", "FREQ=HOURLY;INTERVAL=3;BYHOUR=9,12,15;COUNT=6", None),
        ("hourly/bymonthday-limit", "HOURLY every 6 hours limited by BYMONTHDAY, from an unsynchronized start", "utc", "2026-01-31T00:00:00", "FREQ=HOURLY;INTERVAL=6;BYMONTHDAY=1;COUNT=8", None),
        ("hourly/byyearday-limit", "HOURLY every 12 hours limited by BYYEARDAY", "floating", "2026-12-31T00:00:00", "FREQ=HOURLY;INTERVAL=12;BYYEARDAY=1,-1;COUNT=5", None),
        ("hourly/bymonth-limit", "HOURLY every 8 hours limited by BYMONTH", "utc", "2026-01-31T08:00:00", "FREQ=HOURLY;INTERVAL=8;BYMONTH=2;COUNT=4", None),
        ("hourly/bysetpos-minutes", "HOURLY with BYMINUTE and BYSETPOS", "zone", "2026-01-10T09:00:00", "FREQ=HOURLY;BYMINUTE=0,20,40;BYSETPOS=-1;COUNT=4", None),
        # DAILY
        ("daily/count-utc", "DAILY with COUNT, UTC", "utc", "2026-01-10T09:00:00", "FREQ=DAILY;COUNT=3", None),
        ("daily/count-zone", "DAILY with COUNT, in a zone", "zone", "2026-01-10T09:00:00", "FREQ=DAILY;COUNT=3", None),
        ("daily/count-floating", "DAILY with COUNT, floating", "floating", "2026-01-10T09:00:00", "FREQ=DAILY;COUNT=3", None),
        ("daily/count-all-day", "DAILY with COUNT, all-day", "all-day", "2026-01-10", "FREQ=DAILY;COUNT=3", None),
        ("daily/count-1", "DAILY with COUNT=1", "utc", "2026-01-10T09:00:00", "FREQ=DAILY;COUNT=1", None),
        ("daily/interval-all-day", "DAILY every 3 days, all-day", "all-day", "2026-01-30", "FREQ=DAILY;INTERVAL=3;COUNT=5", None),
        ("daily/interval-floating", "DAILY every 7 days, floating", "floating", "2026-02-20T18:30:00", "FREQ=DAILY;INTERVAL=7;COUNT=4", None),
        ("daily/until-utc", "DAILY until a UTC time", "utc", "2026-01-10T09:00:00", "FREQ=DAILY;UNTIL=20260113T090000Z", None),
        ("daily/until-zone", "DAILY until a UTC time, in a zone (UNTIL one second before the last start)", "zone", "2026-01-10T09:00:00", "FREQ=DAILY;UNTIL=20260113T075959Z", None),
        ("daily/until-floating", "DAILY until a local time", "floating", "2026-01-10T09:00:00", "FREQ=DAILY;UNTIL=20260113T090000", None),
        ("daily/until-all-day", "DAILY until a date", "all-day", "2026-01-10", "FREQ=DAILY;UNTIL=20260113", None),
        ("daily/bymonth-limit", "DAILY limited by BYMONTH, from an unsynchronized start", "all-day", "2026-01-30", "FREQ=DAILY;BYMONTH=2;COUNT=5", None),
        ("daily/bymonthday-limit", "DAILY limited by BYMONTHDAY, positive and negative", "floating", "2026-01-31T09:00:00", "FREQ=DAILY;BYMONTHDAY=1,15,-1;COUNT=7", None),
        ("daily/byday-limit", "DAILY limited by BYDAY", "all-day", "2026-01-10", "FREQ=DAILY;BYDAY=SA,SU;COUNT=6", None),
        ("daily/byday-ordinals-ignored", "DAILY with BYDAY ordinals, which DAILY ignores", "utc", "2026-01-09T09:00:00", "FREQ=DAILY;BYDAY=1MO,-1FR;COUNT=5", None),
        ("daily/byhour-expand", "DAILY expanded by BYHOUR", "utc", "2026-01-10T09:00:00", "FREQ=DAILY;BYHOUR=9,13,17;COUNT=7", None),
        ("daily/byhour-byminute-expand", "DAILY expanded by BYHOUR and BYMINUTE", "zone", "2026-01-10T08:00:00", "FREQ=DAILY;BYHOUR=8,20;BYMINUTE=0,30;COUNT=8", None),
        ("daily/bysecond-expand", "DAILY expanded by BYSECOND", "floating", "2026-01-10T09:00:00", "FREQ=DAILY;BYSECOND=0,59;COUNT=5", None),
        ("daily/bysetpos-times", "DAILY with times and BYSETPOS=-1, from an unsynchronized start", "utc", "2026-01-10T09:00:00", "FREQ=DAILY;BYHOUR=9,12,17;BYSETPOS=-1;COUNT=3", None),
        ("daily/bysetpos-plus-minus", "DAILY with times and BYSETPOS=1,-1", "floating", "2026-01-10T08:00:00", "FREQ=DAILY;BYHOUR=8,12,18;BYMINUTE=0,30;BYSETPOS=1,-1;COUNT=6", None),
        ("daily/byyearday-na", "DAILY with BYYEARDAY (N/A for DAILY) as a limit", "utc", "2026-01-01T09:00:00", "FREQ=DAILY;BYYEARDAY=1,100,-1", "2028-01-02T00:00:00"),
        ("daily/byweekno-na", "DAILY with BYWEEKNO (N/A for DAILY) as a limit", "floating", "2025-12-29T09:00:00", "FREQ=DAILY;BYWEEKNO=1", "2027-02-01T00:00:00"),
        ("daily/byhour-ignored-all-day", "All-day DAILY with BYHOUR, which a DATE start ignores", "all-day", "2026-01-10", "FREQ=DAILY;BYHOUR=9,17;COUNT=3", None),
        ("daily/byminute-bysecond-ignored-all-day", "All-day DAILY with BYMINUTE and BYSECOND, which a DATE start ignores", "all-day", "2026-01-10", "FREQ=DAILY;BYMINUTE=0,30;BYSECOND=15;COUNT=3", None),
        ("daily/window", "DAILY with a window: COUNT counts from the first occurrence", "zone", "2026-01-10T09:00:00", "FREQ=DAILY;COUNT=10", ("2026-01-14T00:00:00", "2026-01-17T00:00:00")),
        ("daily/window-all-day", "All-day DAILY with a window", "all-day", "2026-01-10", "FREQ=DAILY;COUNT=10", ("2026-01-14", "2026-01-17")),
        ("daily/window-floating", "Floating DAILY with a window starting mid-day", "floating", "2026-01-10T09:00:00", "FREQ=DAILY;COUNT=10", ("2026-01-14T09:00:01", "2026-01-17T09:00:00")),
        # WEEKLY
        ("weekly/byday-expand", "WEEKLY expanded by BYDAY", "all-day", "2026-01-05", "FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=7", None),
        ("weekly/interval-until", "WEEKLY every 3 weeks until a local time", "floating", "2026-01-05T09:00:00", "FREQ=WEEKLY;INTERVAL=3;UNTIL=20260316T090000", None),
        ("weekly/wkst-mo-utc", "WEEKLY;INTERVAL=2;BYDAY=TU,SU with WKST=MO, UTC", "utc", "2026-08-04T09:00:00", "FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=MO", None),
        ("weekly/wkst-su-utc", "WEEKLY;INTERVAL=2;BYDAY=TU,SU with WKST=SU, UTC", "utc", "2026-08-04T09:00:00", "FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=SU", None),
        ("weekly/wkst-mo-floating", "WEEKLY;INTERVAL=2;BYDAY=TU,SU with WKST=MO, floating", "floating", "2026-08-04T09:00:00", "FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=MO", None),
        ("weekly/wkst-su-floating", "WEEKLY;INTERVAL=2;BYDAY=TU,SU with WKST=SU, floating", "floating", "2026-08-04T09:00:00", "FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=SU", None),
        ("weekly/wkst-mo-all-day", "WEEKLY;INTERVAL=2;BYDAY=TU,SU with WKST=MO, all-day", "all-day", "2026-08-04", "FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=MO", None),
        ("weekly/wkst-su-all-day", "WEEKLY;INTERVAL=2;BYDAY=TU,SU with WKST=SU, all-day", "all-day", "2026-08-04", "FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=SU", None),
        ("weekly/wkst-mo-zone", "WEEKLY;INTERVAL=2;BYDAY=TU,SU with WKST=MO, in a zone", "zone", "2026-08-04T09:00:00", "FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=MO", None),
        ("weekly/wkst-su-zone", "WEEKLY;INTERVAL=2;BYDAY=TU,SU with WKST=SU, in a zone", "zone", "2026-08-04T09:00:00", "FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=SU", None),
        ("weekly/bymonth-limit", "WEEKLY limited by BYMONTH", "utc", "2026-01-26T09:00:00", "FREQ=WEEKLY;BYMONTH=1,3;COUNT=6", None),
        ("weekly/bysetpos", "WEEKLY on weekdays with BYSETPOS=-1", "all-day", "2026-01-09", "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;COUNT=4", None),
        ("weekly/bysetpos-times", "WEEKLY with times and BYSETPOS=1,-1", "utc", "2026-01-05T09:00:00", "FREQ=WEEKLY;BYDAY=MO,FR;BYHOUR=9,17;BYSETPOS=1,-1;COUNT=6", None),
        ("weekly/bysetpos-full-first-week", "WEEKLY;BYSETPOS=2 from a Wednesday: BYSETPOS counts over the whole first week", "all-day", "2011-03-09", "FREQ=WEEKLY;BYDAY=MO,SA,SU;BYSETPOS=2;COUNT=4", None),
        ("weekly/bysetpos-full-first-week-times", "WEEKLY with times and BYSETPOS=3: the start is the third time of its whole week", "zone", "2026-01-07T09:00:00", "FREQ=WEEKLY;BYDAY=MO,WE,FR;BYHOUR=9;BYMINUTE=0,30;BYSETPOS=3;COUNT=4", None),
        ("weekly/bysetpos-full-first-week-wkst-su", "WEEKLY;WKST=SU;BYSETPOS=3 from a Wednesday: the week from Sunday counts", "floating", "2026-01-07T10:00:00", "FREQ=WEEKLY;BYDAY=SU,MO,FR,SA;BYSETPOS=3;WKST=SU;COUNT=4", None),
        ("weekly/byday-ordinals-ignored", "WEEKLY with BYDAY ordinals, which WEEKLY ignores", "floating", "2026-01-05T09:00:00", "FREQ=WEEKLY;BYDAY=1MO,-1FR;COUNT=4", None),
        ("weekly/bymonthday-na", "WEEKLY with BYMONTHDAY (N/A for WEEKLY) and no BYDAY", "all-day", "2026-02-13", "FREQ=WEEKLY;BYMONTHDAY=13", "2028-01-01"),
        ("weekly/bymonthday-na-with-byday", "WEEKLY;BYDAY=FR with BYMONTHDAY (N/A for WEEKLY) as a limit", "all-day", "2026-02-13", "FREQ=WEEKLY;BYDAY=FR;BYMONTHDAY=13", "2028-01-01"),
        ("weekly/byyearday-na", "WEEKLY with BYYEARDAY (N/A for WEEKLY) and no BYDAY", "utc", "2026-01-01T09:00:00", "FREQ=WEEKLY;BYYEARDAY=1,-1", "2030-01-01T00:00:00"),
        ("weekly/byweekno-na", "WEEKLY with BYWEEKNO (N/A for WEEKLY) and no BYDAY", "floating", "2026-05-11T09:00:00", "FREQ=WEEKLY;BYWEEKNO=20", "2029-01-01T00:00:00"),
        ("weekly/unsynchronized-utc", "WEEKLY on Friday from a Wednesday, UTC", "utc", "2026-01-07T09:00:00", "FREQ=WEEKLY;BYDAY=FR;COUNT=3", None),
        ("weekly/unsynchronized-zone", "WEEKLY on Friday from a Wednesday, in a zone", "zone", "2026-01-07T09:00:00", "FREQ=WEEKLY;BYDAY=FR;COUNT=3", None),
        ("weekly/unsynchronized-floating", "WEEKLY on Friday from a Wednesday, floating", "floating", "2026-01-07T09:00:00", "FREQ=WEEKLY;BYDAY=FR;COUNT=3", None),
        ("weekly/unsynchronized-all-day", "WEEKLY on Friday from a Wednesday, all-day", "all-day", "2026-01-07", "FREQ=WEEKLY;BYDAY=FR;COUNT=3", None),
        # MONTHLY
        ("monthly/from-31st-all-day", "MONTHLY from the 31st skips shorter months, all-day", "all-day", "2026-01-31", "FREQ=MONTHLY;COUNT=6", None),
        ("monthly/from-31st-floating", "MONTHLY from the 31st skips shorter months, floating", "floating", "2026-01-31T09:00:00", "FREQ=MONTHLY;COUNT=6", None),
        ("monthly/from-31st-zone", "MONTHLY from the 31st skips shorter months, in a zone", "zone", "2026-01-31T09:00:00", "FREQ=MONTHLY;COUNT=6", None),
        ("monthly/bymonthday-negative", "MONTHLY on the last and second-to-last days", "utc", "2026-01-30T09:00:00", "FREQ=MONTHLY;BYMONTHDAY=-1,-2;COUNT=6", None),
        ("monthly/bymonthday-31", "MONTHLY on the 31st", "floating", "2026-01-31T09:00:00", "FREQ=MONTHLY;BYMONTHDAY=31;COUNT=5", None),
        ("monthly/bymonthday-29-30-31", "MONTHLY on the 29th to 31st: February 2026 has none", "all-day", "2026-01-29", "FREQ=MONTHLY;BYMONTHDAY=29,30,31", "2026-04-01"),
        ("monthly/bymonthday-29-leap", "MONTHLY on the 29th across a leap February", "all-day", "2027-12-29", "FREQ=MONTHLY;BYMONTHDAY=29;COUNT=6", None),
        ("monthly/bymonthday-minus-31", "MONTHLY on day -31: only months with 31 days", "utc", "2026-01-01T09:00:00", "FREQ=MONTHLY;BYMONTHDAY=-31;COUNT=4", None),
        ("monthly/byday-plain", "MONTHLY on every Monday", "floating", "2026-01-05T09:00:00", "FREQ=MONTHLY;BYDAY=MO;COUNT=6", None),
        ("monthly/byday-ordinals", "MONTHLY on the second Tuesday and second-to-last Thursday", "utc", "2026-01-13T09:00:00", "FREQ=MONTHLY;BYDAY=2TU,-2TH;COUNT=6", None),
        ("monthly/byday-fifth", "MONTHLY on the fifth Friday, which most months lack", "all-day", "2026-01-30", "FREQ=MONTHLY;BYDAY=5FR;COUNT=4", None),
        ("monthly/byday-minus-fifth", "MONTHLY on the fifth-to-last Monday", "zone", "2026-03-02T09:00:00", "FREQ=MONTHLY;BYDAY=-5MO;COUNT=4", None),
        ("monthly/byday-bymonthday-limit", "MONTHLY on Mondays among the 1st to 7th", "floating", "2026-01-05T09:00:00", "FREQ=MONTHLY;BYDAY=MO;BYMONTHDAY=1,2,3,4,5,6,7;COUNT=4", None),
        ("monthly/bysetpos-plus-minus", "MONTHLY on the first and last weekday", "utc", "2026-01-01T09:00:00", "FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=1,-1;COUNT=6", None),
        ("monthly/bysetpos-times", "MONTHLY on the last Friday's later time", "zone", "2026-01-30T17:00:00", "FREQ=MONTHLY;BYDAY=FR;BYHOUR=9,17;BYSETPOS=-1;COUNT=4", None),
        ("monthly/bysetpos-out-of-range", "MONTHLY;BYDAY=MO;BYSETPOS=6: no month has six Mondays", "floating", "2026-01-05T09:00:00", "FREQ=MONTHLY;BYDAY=MO;BYSETPOS=6", "2027-01-01T00:00:00"),
        ("monthly/bysetpos-fifth", "MONTHLY;BYDAY=MO;BYSETPOS=5: months with five Mondays", "all-day", "2026-03-30", "FREQ=MONTHLY;BYDAY=MO;BYSETPOS=5", "2027-01-01"),
        ("monthly/bysetpos-all-day-ignores-time", "All-day MONTHLY;BYDAY=MO;BYHOUR=9,10;BYSETPOS=2: BYHOUR ignored, so the second Monday", "all-day", "2026-01-12", "FREQ=MONTHLY;BYDAY=MO;BYHOUR=9,10;BYSETPOS=2;COUNT=3", None),
        ("monthly/mixed-byday", "MONTHLY;BYDAY=MO,1TU: every Monday and the first Tuesday", "utc", "2026-01-05T09:00:00", "FREQ=MONTHLY;BYDAY=MO,1TU;COUNT=8", None),
        ("monthly/mixed-byday-same-weekday", "MONTHLY;BYDAY=FR,-1FR: every Friday", "all-day", "2026-01-02", "FREQ=MONTHLY;BYDAY=FR,-1FR;COUNT=6", None),
        ("monthly/byyearday-na", "MONTHLY with BYYEARDAY (N/A for MONTHLY) and no BYMONTHDAY", "all-day", "2026-04-10", "FREQ=MONTHLY;BYYEARDAY=100", "2031-01-01"),
        ("monthly/byweekno-na", "MONTHLY with BYWEEKNO (N/A for MONTHLY) and no BYMONTHDAY", "floating", "2026-05-11T09:00:00", "FREQ=MONTHLY;BYWEEKNO=20", "2029-01-01T00:00:00"),
        ("monthly/byweekno-na-with-bymonthday", "MONTHLY;BYMONTHDAY=1..5 with BYWEEKNO=1 (N/A for MONTHLY) as a limit", "floating", "2026-01-01T09:00:00", "FREQ=MONTHLY;BYMONTHDAY=1,2,3,4,5;BYWEEKNO=1", "2029-01-01T00:00:00"),
        ("monthly/bymonth-limit", "MONTHLY limited by BYMONTH", "utc", "2026-03-15T09:00:00", "FREQ=MONTHLY;BYMONTH=3,9;BYMONTHDAY=15;COUNT=4", None),
        ("monthly/interval", "MONTHLY every 5 months", "all-day", "2026-01-15", "FREQ=MONTHLY;INTERVAL=5;COUNT=4", None),
        ("monthly/unsynchronized", "MONTHLY on the 15th from the 10th", "floating", "2026-01-10T09:00:00", "FREQ=MONTHLY;BYMONTHDAY=15;COUNT=3", None),
        ("monthly/until-all-day", "MONTHLY until a date that is an occurrence", "all-day", "2026-01-15", "FREQ=MONTHLY;UNTIL=20260415", None),
        # YEARLY
        ("yearly/feb-29-all-day", "YEARLY from 29 February: only leap years", "all-day", "2024-02-29", "FREQ=YEARLY;COUNT=3", None),
        ("yearly/feb-29-utc", "YEARLY from 29 February: only leap years, UTC", "utc", "2024-02-29T09:00:00", "FREQ=YEARLY;COUNT=3", None),
        ("yearly/bymonth", "YEARLY in January and July", "floating", "2026-01-10T09:00:00", "FREQ=YEARLY;BYMONTH=1,7;COUNT=5", None),
        ("yearly/bymonth-bymonthday-feb", "YEARLY on 28 to 30 February: 30 never, 29 in leap years", "all-day", "2026-02-28", "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=28,29,30", "2029-01-01"),
        ("yearly/bymonthday-31", "YEARLY on the 31st of every month that has one", "floating", "2026-01-31T09:00:00", "FREQ=YEARLY;BYMONTHDAY=31;COUNT=8", None),
        ("yearly/byyearday", "YEARLY on days 1, 60 and -1", "utc", "2026-01-01T09:00:00", "FREQ=YEARLY;BYYEARDAY=1,60,-1;COUNT=8", None),
        ("yearly/byyearday-366", "YEARLY on day 366: leap years only", "all-day", "2024-12-31", "FREQ=YEARLY;BYYEARDAY=366", "2033-01-01"),
        ("yearly/byyearday-minus-366", "YEARLY on day -366: 1 January of leap years only", "floating", "2024-01-01T09:00:00", "FREQ=YEARLY;BYYEARDAY=-366", "2033-01-01T00:00:00"),
        ("yearly/byday-ordinals-in-year", "YEARLY on the first Monday and last Friday of the year", "utc", "2026-01-05T09:00:00", "FREQ=YEARLY;BYDAY=1MO,-1FR;COUNT=6", None),
        ("yearly/byday-ordinal-in-month", "YEARLY with BYMONTH: -1MO is the last Monday of each month", "all-day", "2026-05-25", "FREQ=YEARLY;BYMONTH=5,11;BYDAY=-1MO;COUNT=4", None),
        ("yearly/byday-53rd", "YEARLY on the 53rd Friday, which most years lack", "floating", "2027-12-31T09:00:00", "FREQ=YEARLY;BYDAY=53FR", "2033-01-01T00:00:00"),
        ("yearly/byday-fifth-in-month", "YEARLY in February on the fifth Sunday, which needs a leap year", "utc", "2026-02-01T09:00:00", "FREQ=YEARLY;BYMONTH=2;BYDAY=5SU", "2041-01-01T00:00:00"),
        ("yearly/byday-plain-bymonth", "YEARLY on every Monday of January", "floating", "2026-01-05T09:00:00", "FREQ=YEARLY;BYMONTH=1;BYDAY=MO;COUNT=6", None),
        ("yearly/bysetpos", "YEARLY on the last Sunday of March", "all-day", "2026-03-29", "FREQ=YEARLY;BYMONTH=3;BYDAY=SU;BYSETPOS=-1;COUNT=3", None),
        ("yearly/bysetpos-times", "YEARLY on 1 January's second time", "utc", "2026-01-01T12:00:00", "FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1;BYHOUR=0,12;BYSETPOS=2;COUNT=3", None),
        ("yearly/bysetpos-out-of-range", "YEARLY on 29 February with BYSETPOS=-2: never", "floating", "2024-02-29T09:00:00", "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29;BYSETPOS=-2", "2030-01-01T00:00:00"),
        ("yearly/byweekno", "YEARLY on Monday of week 1, which can fall in December", "utc", "2025-12-29T09:00:00", "FREQ=YEARLY;BYWEEKNO=1;BYDAY=MO;COUNT=4", None),
        ("yearly/byweekno-1-crosses-year", "YEARLY on every day of week 1", "all-day", "2025-12-29", "FREQ=YEARLY;BYWEEKNO=1;BYDAY=MO,TU,WE,TH,FR,SA,SU", "2027-01-15"),
        ("yearly/byweekno-1-in-december", "YEARLY in December on days of week 1 of the next year", "floating", "2025-12-29T09:00:00", "FREQ=YEARLY;BYWEEKNO=1;BYMONTH=12;BYDAY=MO,TU,WE,TH,FR,SA,SU", "2031-01-01T00:00:00"),
        ("yearly/byweekno-negative", "YEARLY on Monday and Sunday of the last week", "floating", "2025-12-22T09:00:00", "FREQ=YEARLY;BYWEEKNO=-1;BYDAY=MO,SU", "2028-01-01T00:00:00"),
        ("yearly/byweekno-minus-52-late-december", "YEARLY on Monday of week -52, which can be late December", "utc", "2024-01-01T09:00:00", "FREQ=YEARLY;BYWEEKNO=-52;BYDAY=MO", "2026-01-01T00:00:00"),
        ("yearly/byweekno-53", "YEARLY in week 53, which 52-week years lack", "floating", "2020-12-28T09:00:00", "FREQ=YEARLY;BYWEEKNO=53;BYDAY=MO,SU", "2028-01-01T00:00:00"),
        ("yearly/byweekno-52-early-january", "YEARLY in week 52, whose days can start the next year", "all-day", "2021-12-27", "FREQ=YEARLY;BYWEEKNO=52;BYDAY=MO,SU", "2024-01-01"),
        ("yearly/byweekno-wkst-mo", "YEARLY on Sunday of week 1, WKST=MO", "all-day", "2023-01-01", "FREQ=YEARLY;BYWEEKNO=1;BYDAY=SU;WKST=MO", "2030-01-01"),
        ("yearly/byweekno-wkst-su", "YEARLY on Sunday of week 1, WKST=SU", "all-day", "2023-01-01", "FREQ=YEARLY;BYWEEKNO=1;BYDAY=SU;WKST=SU", "2030-01-01"),
        ("yearly/byweekno-without-byday", "YEARLY;BYWEEKNO=20 without BYDAY takes DTSTART's weekday", "utc", "2026-05-13T09:00:00", "FREQ=YEARLY;BYWEEKNO=20;COUNT=3", None),
        ("yearly/byweekno-without-byday-all-day", "All-day YEARLY;BYWEEKNO=1,-1 without BYDAY takes DTSTART's weekday", "all-day", "2026-01-01", "FREQ=YEARLY;BYWEEKNO=1,-1", "2029-01-01"),
        ("yearly/mixed-byday", "YEARLY in June on Saturdays and the first Monday", "all-day", "2026-06-01", "FREQ=YEARLY;BYMONTH=6;BYDAY=SA,1MO;COUNT=8", None),
        ("yearly/interval", "YEARLY every 4 years", "utc", "2024-11-05T09:00:00", "FREQ=YEARLY;INTERVAL=4;COUNT=3", None),
        ("yearly/until-floating", "YEARLY until a local time", "floating", "2026-03-01T09:00:00", "FREQ=YEARLY;UNTIL=20290301T090000", None),
        ("yearly/until-zone", "YEARLY until a UTC time, in a zone", "zone", "2026-07-01T09:00:00", "FREQ=YEARLY;UNTIL=20280701T070000Z", None),
        ("yearly/unsynchronized", "YEARLY in June from a January start", "all-day", "2026-01-10", "FREQ=YEARLY;BYMONTH=6;COUNT=3", None),
        # UNTIL before the start, and UNTIL of another kind
        ("until/before-start-utc", "UNTIL before the start, UTC", "utc", "2026-01-10T09:00:00", "FREQ=DAILY;UNTIL=20260101T000000Z", None),
        ("until/before-start-zone", "UNTIL before the start, in a zone", "zone", "2026-01-10T09:00:00", "FREQ=WEEKLY;UNTIL=20260110T075959Z", None),
        ("until/before-start-floating", "UNTIL before the start, floating", "floating", "2026-01-10T09:00:00", "FREQ=DAILY;UNTIL=20260110T085959", None),
        ("until/before-start-all-day", "UNTIL before the start, all-day", "all-day", "2026-01-10", "FREQ=MONTHLY;UNTIL=20260109", None),
        ("until/date-on-timed", "A date-only UNTIL on a timed series: the end of that day in its zone", "zone", "2026-01-10T23:30:00", "FREQ=DAILY;UNTIL=20260113", None),
        ("until/local-on-timed", "A local UNTIL on a timed series: a wall time in its zone", "zone", "2026-01-10T09:00:00", "FREQ=DAILY;UNTIL=20260113T090000", None),
        ("until/utc-on-all-day", "A UTC UNTIL on an all-day series: its UTC date", "all-day", "2026-01-10", "FREQ=DAILY;UNTIL=20260113T000000Z", None),
        ("until/local-on-all-day", "A local UNTIL on an all-day series: its date", "all-day", "2026-01-10", "FREQ=DAILY;UNTIL=20260113T120000", None),
        ("until/date-on-floating", "A date-only UNTIL on a floating series: the end of that day", "floating", "2026-01-10T09:00:00", "FREQ=DAILY;UNTIL=20260113", None),
        ("until/utc-on-floating", "A UTC UNTIL on a floating series: its UTC wall time", "floating", "2026-01-10T09:00:00", "FREQ=DAILY;UNTIL=20260113T090000Z", None),
        # COUNT with UNTIL: whichever comes first
        ("count-and-until/count-first", "COUNT and UNTIL: COUNT ends the series first", "utc", "2026-01-10T09:00:00", "FREQ=DAILY;COUNT=3;UNTIL=20260120T090000Z", None),
        ("count-and-until/until-first", "COUNT and UNTIL: UNTIL ends the series first", "floating", "2026-01-10T09:00:00", "FREQ=DAILY;COUNT=10;UNTIL=20260112T090000", None),
    ]
    # fmt: on
    cases = []
    for slug, title, kind, start, rule, window in rows:
        frm, before = window if isinstance(window, tuple) else (None, window)
        cases.append(
            Case(
                id=f"coverage/{slug.replace('/', '-')}",
                title=title,
                source="Coverage",
                kind="timed" if kind in ("utc", "zone") else kind,
                time_zone={"utc": "UTC", "zone": COVERAGE_ZONE}.get(kind),
                start=start,
                rule=rule,
                window_from=frm,
                window_before=before,
            )
        )
    return cases


# ---------------------------------------------------------------------------------------------
# Expansion


@dataclasses.dataclass(frozen=True)
class Semantics:
    """Each switch is one way ADR 0048 differs from python-dateutil; all False is dateutil."""

    first_always_counts: bool = True
    nothing_before_start: bool = True
    start_compared_by_instant: bool = True
    ascending_distinct: bool = True
    weekly_full_first_week: bool = True
    all_day_ignores_time_parts: bool = True
    byday_entries_are_alternatives: bool = True
    yearly_weekno_takes_start_weekday: bool = YEARLY_WEEKNO_TAKES_DTSTART_WEEKDAY
    na_parts_keep_start_day: bool = NA_PARTS_KEEP_DTSTART_DAY
    rfc_week_numbers: bool = True
    date_until_is_end_of_day: bool = True


OURS = Semantics()
DATEUTIL = Semantics(**{field.name: False for field in dataclasses.fields(Semantics)})
SWITCHES = [field.name for field in dataclasses.fields(Semantics)]

Value = dt.datetime  # UTC-aware for timed series, naive otherwise (all-day at midnight)


def parse_rule(text: str) -> dict[str, str]:
    rule: dict[str, str] = {}
    for part in text.split(";"):
        key, _, value = part.partition("=")
        rule[key.upper()] = value.upper()
    return rule


def rule_text(rule: dict[str, str]) -> str:
    return ";".join(f"{key}={value}" for key, value in rule.items())


def parse_until(text: str) -> tuple[str, dt.date | dt.datetime]:
    match = re.fullmatch(r"(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?", text)
    if match is None:
        raise ValueError(f"UNTIL {text!r}")
    y, mo, d, h, mi, s, z = match.groups()
    if h is None:
        return "date", dt.date(int(y), int(mo), int(d))
    wall = dt.datetime(int(y), int(mo), int(d), int(h), int(mi), int(s))
    return ("utc", wall.replace(tzinfo=UTC)) if z else ("local", wall)


def week1_start(year: int, wkst: int) -> dt.date:
    """RFC 5545 §3.3.10: week 1 is the first week starting on WKST with 4 days of the year."""
    jan1 = dt.date(year, 1, 1)
    offset = (jan1.weekday() - wkst) % 7
    return jan1 - dt.timedelta(days=offset) if offset <= 3 else jan1 + dt.timedelta(days=7 - offset)


def week_numbers(day: dt.date, wkst: int) -> tuple[int, int]:
    """A day's week number in the week-numbering year it belongs to, from the start and the end."""
    year = day.year
    if day < week1_start(year, wkst):
        year -= 1
    elif day >= week1_start(year + 1, wkst):
        year += 1
    first = week1_start(year, wkst)
    weeks = (week1_start(year + 1, wkst) - first).days // 7
    number = (day - first).days // 7 + 1
    return number, number - weeks - 1


class Series:
    """A case's first occurrence, the wall clock its rule runs on, and how dates read and print."""

    def __init__(self, case: Case):
        self.case = case
        self.kind = case.kind
        self.zone = zoneinfo.ZoneInfo(case.time_zone) if case.kind == "timed" else None
        if case.kind == "timed" and case.time_zone is None:
            raise ValueError(f"{case.id}: a timed case needs a time zone")
        self.start, self.wall, self.fold = self.point(case.start)

    def point(self, text: str) -> tuple[Value, dt.datetime, int]:
        """A start or window bound: its value, its wall time and the fold that picks it."""
        if self.kind == "all-day":
            day = dt.datetime.combine(dt.date.fromisoformat(text), dt.time())
            return day, day, 0
        match = re.fullmatch(r"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})([+-]\d{2}:\d{2})?", text)
        if match is None:
            raise ValueError(f"{self.case.id}: {text!r}")
        wall = dt.datetime.fromisoformat(match[1])
        if self.kind == "floating":
            if match[2]:
                raise ValueError(f"{self.case.id}: a floating time has no offset")
            return wall, wall, 0
        if match[2] is None:
            return wall.replace(tzinfo=self.zone).astimezone(UTC), wall, 0
        instant = dt.datetime.fromisoformat(text).astimezone(UTC)
        if instant.astimezone(self.zone).replace(tzinfo=None) != wall:
            raise ValueError(f"{self.case.id}: {text} isn't a time in {self.case.time_zone}")
        fold = 0 if wall.replace(tzinfo=self.zone, fold=0).astimezone(UTC) == instant else 1
        return instant, wall, fold

    def dtstart(self) -> dt.datetime:
        return self.wall.replace(tzinfo=self.zone, fold=self.fold) if self.zone else self.wall

    def value(self, generated: dt.datetime) -> Value:
        """A date dateutil generated; its wall times carry fold=0, which is `compatible`."""
        return generated.astimezone(UTC) if self.zone else generated

    def wall_of(self, value: Value) -> dt.datetime:
        return value.astimezone(self.zone).replace(tzinfo=None, fold=0) if self.zone else value

    def show(self, value: Value) -> str:
        if self.zone:
            return value.astimezone(self.zone).isoformat()
        if self.kind == "all-day" and value.time() == dt.time():
            return value.date().isoformat()
        return value.isoformat()

    def until(self, text: str, semantics: Semantics) -> Value:
        """UNTIL in the series' kind, as `coerceRecurrenceDate` brings it (ADR 0048 point 4)."""
        kind, until = parse_until(text)
        if self.zone:
            if kind == "utc":
                return until
            if kind == "local":
                return until.replace(tzinfo=self.zone).astimezone(UTC)
            next_day = dt.datetime.combine(until + ONE_DAY, dt.time()).replace(tzinfo=self.zone)
            return next_day.astimezone(UTC) - dt.timedelta(microseconds=1)
        if self.kind == "all-day":
            if kind == "utc":
                until = until.astimezone(UTC).date()
            elif kind == "local":
                until = until.date()
            return dt.datetime.combine(until, dt.time())
        if kind == "utc":
            return until.replace(tzinfo=None)
        if kind == "local":
            return until
        # python-dateutil reads a date-only UNTIL as that day's midnight.
        end = dt.time.max if semantics.date_until_is_end_of_day else dt.time()
        return dt.datetime.combine(until, end)


def fill_start_day(rule: dict[str, str], wall: dt.datetime, semantics: Semantics) -> None:
    """Writes out the day RFC 5545 takes from DTSTART when the rule names none, as dateutil does,
    so leaving out BYWEEKNO or splitting BYDAY later can't change it."""
    has = lambda *parts: any(part in rule for part in parts)  # noqa: E731
    weekday = WEEKDAYS[wall.weekday()]
    frequency = rule["FREQ"]
    if frequency == "YEARLY":
        if not has("BYWEEKNO", "BYYEARDAY", "BYMONTHDAY", "BYDAY"):
            rule.setdefault("BYMONTH", str(wall.month))
            rule["BYMONTHDAY"] = str(wall.day)
        elif "BYWEEKNO" in rule and not has("BYYEARDAY", "BYMONTHDAY", "BYDAY"):
            rule["BYDAY"] = (
                weekday if semantics.yearly_weekno_takes_start_weekday else EVERY_WEEKDAY
            )
    elif frequency == "MONTHLY" and not has("BYMONTHDAY", "BYDAY"):
        if semantics.na_parts_keep_start_day or not has("BYWEEKNO", "BYYEARDAY"):
            rule["BYMONTHDAY"] = str(wall.day)
        else:
            rule["BYDAY"] = EVERY_WEEKDAY
    elif frequency == "WEEKLY" and not has("BYDAY"):
        if semantics.na_parts_keep_start_day or not has("BYWEEKNO", "BYYEARDAY", "BYMONTHDAY"):
            rule["BYDAY"] = weekday
        else:
            rule["BYDAY"] = EVERY_WEEKDAY


FREQUENCIES = ["YEARLY", "MONTHLY", "WEEKLY", "DAILY", "HOURLY", "MINUTELY", "SECONDLY"]


def fill_start_time(rule: dict[str, str], wall: dt.datetime) -> None:
    """Writes out the time parts dateutil takes from DTSTART, as `fill_start_day` does the day."""
    level = FREQUENCIES.index(rule["FREQ"])
    for part, coarser_than, value in (
        ("BYHOUR", "HOURLY", wall.hour),
        ("BYMINUTE", "MINUTELY", wall.minute),
        ("BYSECOND", "SECONDLY", wall.second),
    ):
        if level < FREQUENCIES.index(coarser_than):
            rule.setdefault(part, str(value))


def period_start(series: Series, rule: dict[str, str], semantics: Semantics) -> dt.datetime:
    """Where the period holding DTSTART begins, on DTSTART's interval grid.

    dateutil leaves out dates before DTSTART inside its iterator, comparing wall times. Starting
    it here, with every DTSTART default written out, gives the first period's dates whole, so
    `expand` can drop the early ones by instant or by wall time. dateutil's first WEEKLY period
    starts on DTSTART's day; the engine's is the whole week starting on WKST.
    """
    wall = series.wall
    midnight = wall.replace(hour=0, minute=0, second=0)
    frequency = rule["FREQ"]
    if frequency == "YEARLY":
        return midnight.replace(month=1, day=1)
    if frequency == "MONTHLY":
        return midnight.replace(day=1)
    if frequency == "WEEKLY":
        if not semantics.weekly_full_first_week:
            return midnight
        wkst = WEEKDAYS.index(rule.get("WKST", "MO"))
        return midnight - dt.timedelta(days=(midnight.weekday() - wkst) % 7)
    if frequency == "DAILY":
        return midnight
    if frequency == "HOURLY":
        return wall.replace(minute=0, second=0)
    if frequency == "MINUTELY":
        return wall.replace(second=0)
    return wall


def generated(series: Series, rule: dict[str, str], semantics: Semantics) -> Iterator[dt.datetime]:
    """dateutil's dates for the rule without COUNT and UNTIL, in wall-time order, from the start
    of the period holding DTSTART."""
    rule = {key: value for key, value in rule.items() if key not in ("COUNT", "UNTIL")}
    if series.kind == "all-day" and semantics.all_day_ignores_time_parts:
        for part in TIME_PARTS:
            rule.pop(part, None)
    fill_start_day(rule, series.wall, semantics)
    fill_start_time(rule, series.wall)
    first = period_start(series, rule, semantics)
    dtstart = first.replace(tzinfo=series.zone) if series.zone else first

    weeks: tuple[set[int], int] | None = None
    if semantics.rfc_week_numbers and "BYWEEKNO" in rule:
        if "BYSETPOS" in rule:
            raise ValueError(f"{series.case.id}: BYWEEKNO with BYSETPOS needs expected_override")
        numbers = {int(n) for n in rule.pop("BYWEEKNO").split(",")}
        weeks = (numbers, WEEKDAYS.index(rule.get("WKST", "MO")))

    rules = [rule]
    days = rule.get("BYDAY", "").split(",")
    plain = [day for day in days if day.isalpha()]
    numbered = [day for day in days if day and not day.isalpha()]
    if (
        semantics.byday_entries_are_alternatives
        and rule["FREQ"] in ("MONTHLY", "YEARLY")
        and plain
        and numbered
    ):
        if "BYSETPOS" in rule:
            raise ValueError(f"{series.case.id}: mixed BYDAY with BYSETPOS needs expected_override")
        rules = [{**rule, "BYDAY": ",".join(plain)}, {**rule, "BYDAY": ",".join(numbered)}]

    streams = [iter(du.rrulestr(rule_text(r), dtstart=dtstart)) for r in rules]
    stream = streams[0] if len(streams) == 1 else heapq.merge(*streams, key=naive)
    previous = None
    for date in stream:
        if naive(date) == previous:
            continue  # a day two BYDAY entries both name is one date
        previous = naive(date)
        if weeks is None or any(n in weeks[0] for n in week_numbers(date.date(), weeks[1])):
            yield date


def naive(date: dt.datetime) -> dt.datetime:
    return date.replace(tzinfo=None, fold=0)


def expand(series: Series, rule_text_: str, semantics: Semantics) -> list[Value]:
    """The case's occurrences under `semantics`; DATEUTIL reproduces dateutil itself."""
    case = series.case
    rule = parse_rule(rule_text_)
    count = int(rule["COUNT"]) if "COUNT" in rule else None
    until = series.until(rule["UNTIL"], semantics) if "UNTIL" in rule else None
    window_from = series.point(case.window_from)[0] if case.window_from else None
    window_before = series.point(case.window_before)[0] if case.window_before else None

    # dateutil runs in wall-time order, which a gap can reorder by at most its length; going on
    # for two more days covers that.
    bounds = [series.wall_of(v) + 2 * ONE_DAY for v in (until, window_before) if v is not None]
    if not bounds and count is None:
        raise ValueError(f"{case.id}: a rule without COUNT or UNTIL needs window.before")
    stop = min(bounds, default=None)

    rule_dates: list[Value] = []
    distinct: set[Value] = set()
    count_stop = None
    for step, date in enumerate(generated(series, rule, semantics)):
        wall = naive(date)
        if (stop and wall > stop) or (count_stop and wall > count_stop):
            break
        if step > MAX_STEPS:
            raise ValueError(f"{case.id}: more than {MAX_STEPS} steps")
        value = series.value(date)
        if not semantics.ascending_distinct and until is not None and value > until:
            break  # dateutil stops at the first date past UNTIL, in wall-time order
        # The first occurrence is the start instant, so the rule's own copy of it goes too.
        after = value > series.start if semantics.first_always_counts else value >= series.start
        by_wall = wall >= series.wall  # dateutil compares wall times
        if semantics.nothing_before_start and semantics.start_compared_by_instant:
            keep = after
        elif semantics.nothing_before_start:
            keep = by_wall and after
        elif semantics.start_compared_by_instant:
            keep = by_wall or after
        else:
            keep = by_wall
        if not keep:
            continue
        rule_dates.append(value)
        if count is not None and count_stop is None:
            distinct.add(value)
            if len(distinct) > count:
                count_stop = wall + 2 * ONE_DAY

    if semantics.ascending_distinct:
        dates = sorted(
            set(rule_dates) | ({series.start} if semantics.first_always_counts else set())
        )
    else:
        dates = ([series.start] if semantics.first_always_counts else []) + rule_dates
    if count is not None:
        dates = dates[:count]
    if until is not None and semantics.ascending_distinct:
        dates = [
            d for d in dates if d <= until or (semantics.first_always_counts and d == series.start)
        ]
    return [
        d
        for d in dates
        if (window_from is None or d >= window_from)
        and (window_before is None or d < window_before)
    ]


def dateutil_raw(series: Series) -> list[Value]:
    """python-dateutil itself on the rule as written, in the case's window."""
    case = series.case
    rule = parse_rule(case.rule)
    try:
        recurrence = du.rrulestr(case.rule, dtstart=series.dtstart())
    except ValueError:
        # dateutil rejects an UNTIL whose kind doesn't match DTSTART; it gets the converted one.
        until = rule.pop("UNTIL")
        recurrence = du.rrulestr(rule_text(rule), dtstart=series.dtstart()).replace(
            until=series.until(until, OURS)
        )
    window_from = series.point(case.window_from)[0] if case.window_from else None
    window_before = series.point(case.window_before)[0] if case.window_before else None
    stop = series.wall_of(window_before) + 2 * ONE_DAY if window_before is not None else None
    dates = []
    for step, date in enumerate(recurrence):
        if stop and naive(date) > stop:
            break
        if step > MAX_STEPS:
            raise ValueError(f"{case.id}: more than {MAX_STEPS} steps")
        dates.append(series.value(date))
    return [
        d
        for d in dates
        if (window_from is None or d >= window_from)
        and (window_before is None or d < window_before)
    ]


# ---------------------------------------------------------------------------------------------
# Divergences


ADR_FIRST = (
    "The first occurrence is always one, and counts toward COUNT as RFC 5545 §3.3.10 says, even "
    "when the rule wouldn't produce it or UNTIL is earlier. RFC 5545 leaves that set undefined and "
    "python-dateutil leaves DTSTART out; we keep it because the application's event exists at that "
    "time (ADR 0048 point 4)."
)


def explain(series: Series, switch: str, ours: list[str], theirs: list[str]) -> str:
    """Why ADR 0048 departs from dateutil here, for one semantics switch."""
    case = series.case
    rule = parse_rule(case.rule)
    missing = [d for d in ours if d not in theirs]
    extra = [d for d in theirs if d not in ours]
    listed = lambda dates: ", ".join(dates[:4]) + (" …" if len(dates) > 4 else "")  # noqa: E731
    if switch == "first_always_counts":
        if "UNTIL" in rule and series.until(rule["UNTIL"], OURS) < series.start:
            why = "UNTIL is before DTSTART."
        elif series.fold:
            why = (
                f"DTSTART is the second of the two {hhmm(series.wall)}s, which the rule's wall "
                "clock never gives (it takes the first)."
            )
        else:
            why = "DTSTART isn't a date the rule produces."
        return f"{why} {ADR_FIRST}"
    if switch == "nothing_before_start":
        return (
            "The first occurrence is the start instant, and every other one comes after it. "
            "python-dateutil compares wall times, so it also gives "
            f"{listed(extra)}, at or before the start instant."
        )
    if switch == "start_compared_by_instant":
        return (
            "Rule dates are compared with the start by instant, not wall time, as for a fold: a "
            "wall time before DTSTART's that a gap moves past the start instant is an occurrence. "
            f"python-dateutil compares wall times, so it leaves out {listed(missing)}."
        )
    if switch == "weekly_full_first_week":
        # Later differences are COUNT moving along; the first week is where they part.
        week_end = period_start(series, rule, OURS) + dt.timedelta(days=7)
        in_first_week = lambda text: wall_from_text(text) < week_end  # noqa: E731
        theirs_first = [d for d in extra if in_first_week(d)]
        ours_first = [d for d in missing if in_first_week(d)]
        not_ours = f", not {listed(ours_first)}" if ours_first else ""
        return (
            "A WEEKLY period is the whole week starting on WKST, the first one included: RFC 5545 "
            "§3.3.10 has BYSETPOS pick within the set of recurrence instances of each interval, "
            "and dates before DTSTART are left out afterwards. python-dateutil starts the first "
            "week at DTSTART, so its BYSETPOS counts from there: in the first week it gives "
            f"{listed(theirs_first) if theirs_first else 'nothing'}{not_ours}."
        )
    if switch == "ascending_distinct":
        parts = []
        if len(set(theirs)) < len(theirs):
            seen, twice = set(), []
            for d in theirs:
                if d in seen and d not in twice:
                    twice.append(d)
                seen.add(d)
            parts.append(f"gives {listed(twice)} twice")
        if [d for d in dict.fromkeys(theirs)] != sorted(
            dict.fromkeys(theirs), key=series_sort(series)
        ):
            parts.append("gives them in wall-time order, not by instant")
        if not parts:
            parts.append(
                f"counts them in wall-time order, so it gives {listed(extra)} where the earliest "
                f"are {listed(missing)}"
            )
        return (
            "Starts come out strictly increasing, and duplicates, such as two wall times resolving "
            "out of the same gap, appear once (RFC 5545 §3.8.5.3: duplicate instances are ignored; "
            "ADR 0048 points 4 and 5); COUNT counts the earliest distinct starts. python-dateutil "
            + " and ".join(parts)
            + "."
        )
    if switch == "all_day_ignores_time_parts":
        parts = ", ".join(p for p in TIME_PARTS if p in rule)
        return (
            f"BYHOUR, BYMINUTE and BYSECOND on an all-day series are ignored, as RFC 5545 §3.3.10 "
            f"says for a DATE DTSTART (ADR 0048 point 4). python-dateutil applies {parts}."
        )
    if switch == "byday_entries_are_alternatives":
        return (
            f"BYDAY={rule['BYDAY']} lists alternatives (RFC 5545 §3.3.10): a day matches when it "
            "matches any entry. python-dateutil intersects the plain weekdays with the numbered "
            "ones, so a day must match both."
        )
    if switch == "yearly_weekno_takes_start_weekday":
        return (
            "RFC 5545 §3.3.10: information the rule doesn't give comes from DTSTART, so YEARLY with "
            "BYWEEKNO and none of BYDAY, BYMONTHDAY or BYYEARDAY repeats on DTSTART's weekday "
            f"({WEEKDAYS[series.wall.weekday()]}). python-dateutil gives every day of the listed "
            "weeks."
        )
    if switch == "na_parts_keep_start_day":
        na = {
            "MONTHLY": ("BYWEEKNO", "BYYEARDAY"),
            "WEEKLY": ("BYWEEKNO", "BYYEARDAY", "BYMONTHDAY"),
        }[rule["FREQ"]]
        named = " and ".join(p for p in na if p in rule)
        day = "BYDAY" if rule["FREQ"] == "WEEKLY" else "BYMONTHDAY or BYDAY"
        from_start = "weekday" if rule["FREQ"] == "WEEKLY" else "day of the month"
        return (
            f"RFC 5545 §3.3.10's table gives {named} no role in FREQ={rule['FREQ']} (N/A); as a "
            f"limit it only filters what the rest of the rule gives, which without {day} is "
            f"DTSTART's {from_start}. python-dateutil drops that DTSTART default when {named} is "
            f"present, so it gives {listed(extra)} as well."
            if extra
            else f"RFC 5545 §3.3.10's table gives {named} no role in FREQ={rule['FREQ']} (N/A); "
            f"as a limit it only filters what the rest of the rule gives, which without {day} is "
            f"DTSTART's {from_start}. python-dateutil drops that DTSTART default when {named} is "
            "present."
        )
    if switch == "rfc_week_numbers":
        parts = []
        if missing:
            parts.append(f"leaves out {listed(missing)}")
        if extra:
            parts.append(f"adds {listed(extra)}")
        return (
            "python-dateutil bug: its BYWEEKNO numbers the days at the start of a year that belong "
            "to the previous year's week 52 as week 53, and never matches late-December days of "
            "the next year's week 1 by a negative number (-52, -53). With RFC 5545 §3.3.10's "
            "numbering (week 1 is the first week starting on WKST with four days of the year; "
            f"negative numbers count from the end), dateutil {' and '.join(parts)}."
        )
    if switch == "date_until_is_end_of_day":
        return (
            "A date-only UNTIL on a floating series means the end of that day, as "
            "`coerceRecurrenceDate` brings it (ADR 0048 point 4). python-dateutil reads it as that "
            "day's midnight."
        )
    raise AssertionError(switch)


def wall_from_text(text: str) -> dt.datetime:
    """The wall time a fixture date shows, whatever its kind."""
    if len(text) == 10:
        return dt.datetime.combine(dt.date.fromisoformat(text), dt.time())
    return dt.datetime.fromisoformat(text).replace(tzinfo=None)


def series_sort(series: Series) -> Callable[[str], dt.datetime]:
    if series.zone:
        return lambda text: dt.datetime.fromisoformat(text).astimezone(UTC)
    return lambda text: dt.datetime.fromisoformat(text)


# ---------------------------------------------------------------------------------------------
# ical.js


ICALJS_SWITCH_NOTES = {
    "first_always_counts": "ical.js leaves out DTSTART when the rule doesn't produce it or UNTIL "
    "is earlier, as python-dateutil does.",
    "all_day_ignores_time_parts": "ical.js applies BYHOUR, BYMINUTE and BYSECOND to a DATE start; "
    "RFC 5545 §3.3.10 says to ignore them.",
    "date_until_is_end_of_day": "ical.js reads a date-only UNTIL as that day's midnight, as "
    "python-dateutil does.",
    "rfc_week_numbers": "ical.js gives python-dateutil's week numbering here.",
    "weekly_full_first_week": "ical.js starts the first WEEKLY period at DTSTART for BYSETPOS, as "
    "python-dateutil does.",
    "byday_entries_are_alternatives": "ical.js intersects plain and numbered BYDAY entries, as "
    "python-dateutil does.",
    "yearly_weekno_takes_start_weekday": "ical.js gives every day of the listed weeks, as "
    "python-dateutil does.",
    "na_parts_keep_start_day": "ical.js drops DTSTART's day when an N/A part is present, as "
    "python-dateutil does.",
}


_V = f"ical.js {ICALJS_VERSION}"
_BYSETPOS_IGNORED = f"{_V} ignores BYSETPOS in HOURLY, DAILY and WEEKLY rules."
_BYSETPOS_IGNORED_NO_START = (
    f"{_V} ignores BYSETPOS in HOURLY, DAILY and WEEKLY rules, and leaves out DTSTART, which the "
    "rule doesn't produce."
)
_BYWEEKNO_IGNORED = (
    f"{_V} doesn't limit dates to the BYWEEKNO weeks: it gives BYDAY's weekdays across the year "
    "(or BYMONTH), and its first date isn't always DTSTART."
)
_ALL_DAY_COUNT = (
    f"{_V} ignores BYHOUR, BYMINUTE and BYSECOND on a DATE start, but COUNT=3 then ends after two "
    "dates."
)
_FEB_29 = (
    f"{_V} moves 29 February to 1 March in other years; RFC 5545 §3.3.10 says invalid dates are "
    "ignored."
)
# Disagreements the switches can't explain; checked by hand against ical.js's output.
ICALJS_NOTES = {
    "rfc5545/every-20th-monday": f"{_V} ignores the ordinal of BYDAY=20MO in a YEARLY rule without "
    "BYMONTH and gives every Monday.",
    "rfc5545/monday-of-week-20": _BYWEEKNO_IGNORED,
    "coverage/hourly-bysetpos-minutes": _BYSETPOS_IGNORED,
    "coverage/daily-bysetpos-times": _BYSETPOS_IGNORED,
    "coverage/daily-bysetpos-plus-minus": _BYSETPOS_IGNORED,
    "coverage/weekly-bysetpos": _BYSETPOS_IGNORED,
    "coverage/weekly-bysetpos-times": _BYSETPOS_IGNORED,
    "coverage/weekly-bysetpos-full-first-week": _BYSETPOS_IGNORED_NO_START,
    "coverage/weekly-bysetpos-full-first-week-times": _BYSETPOS_IGNORED,
    "coverage/weekly-bysetpos-full-first-week-wkst-su": _BYSETPOS_IGNORED_NO_START,
    "coverage/daily-bymonthday-limit": f"{_V} ignores a negative BYMONTHDAY in DAILY (and throws "
    "a RangeError for FREQ=DAILY;BYMONTHDAY=-1 alone).",
    "coverage/daily-byhour-ignored-all-day": _ALL_DAY_COUNT,
    "coverage/daily-byminute-bysecond-ignored-all-day": _ALL_DAY_COUNT,
    "coverage/monthly-bysetpos-times": f"{_V} gets BYSETPOS with BYHOUR wrong in MONTHLY: it adds "
    "the 1st of the month and gives both times of the last Friday.",
    "coverage/monthly-bysetpos-all-day-ignores-time": f"{_V} gets BYSETPOS with BYHOUR on a DATE "
    "start wrong: it gives the 1st of the month and stops early.",
    "coverage/yearly-bysetpos-times": f"{_V} gets BYSETPOS with BYHOUR wrong in YEARLY: it gives "
    "00:00 from the next year on and leaves out DTSTART.",
    "coverage/yearly-bysetpos-out-of-range": f"{_V} ignores BYSETPOS=-2 when the year has one "
    "date, and gives that date.",
    "coverage/yearly-feb-29-all-day": _FEB_29,
    "coverage/yearly-feb-29-utc": _FEB_29,
    "coverage/yearly-bymonth-bymonthday-feb": f"{_V} rolls 29 and 30 February over into 1 and 2 "
    "March instead of skipping them.",
    "coverage/yearly-bymonthday-31": f"{_V} takes the month from DTSTART when YEARLY has "
    "BYMONTHDAY without BYMONTH, so it gives 31 January only. python-dateutil and this fixture "
    "expand BYMONTHDAY over every month of the year, as RFC 5545 §3.3.10's table (BYMONTHDAY: "
    "Expand for YEARLY) reads.",
    "coverage/yearly-byday-53rd": f"{_V} gets BYDAY=53FR wrong: it gives a Friday in January of "
    "each later year.",
    "coverage/yearly-byweekno": _BYWEEKNO_IGNORED,
    "coverage/yearly-byweekno-1-crosses-year": _BYWEEKNO_IGNORED,
    "coverage/yearly-byweekno-1-in-december": _BYWEEKNO_IGNORED,
    "coverage/yearly-byweekno-negative": _BYWEEKNO_IGNORED,
    "coverage/yearly-byweekno-minus-52-late-december": _BYWEEKNO_IGNORED,
    "coverage/yearly-byweekno-53": _BYWEEKNO_IGNORED,
    "coverage/yearly-byweekno-52-early-january": _BYWEEKNO_IGNORED,
    "coverage/yearly-byweekno-wkst-mo": _BYWEEKNO_IGNORED,
    "coverage/yearly-byweekno-wkst-su": _BYWEEKNO_IGNORED,
    "coverage/yearly-byweekno-without-byday": f"{_V} gives no dates at all for YEARLY with "
    "BYWEEKNO and no BYDAY, not even DTSTART.",
    "coverage/yearly-byweekno-without-byday-all-day": f"{_V} gives no dates at all for YEARLY with "
    "BYWEEKNO and no BYDAY, not even DTSTART.",
}


def floating_equivalent(case: Case) -> Case:
    """The case as ical.js sees it: the same rule on the wall clock, with no zone to resolve in."""
    if case.kind != "timed":
        return case
    rule = parse_rule(case.rule)
    if "UNTIL" in rule:
        kind, until = parse_until(rule["UNTIL"])
        if kind == "utc":
            wall = until.astimezone(zoneinfo.ZoneInfo(case.time_zone)).replace(tzinfo=None)
            rule["UNTIL"] = wall.strftime("%Y%m%dT%H%M%S")
    strip = lambda text: text[:19] if text else None  # noqa: E731
    return dataclasses.replace(
        case,
        kind="floating",
        time_zone=None,
        start=strip(case.start),
        rule=rule_text(rule),
        window_from=strip(case.window_from),
        window_before=strip(case.window_before),
    )


def find_icaljs(argument: str | None, workdir: Path) -> Path:
    if argument:
        path = Path(argument).resolve()
        if path.is_dir():
            path = path / "node_modules/ical.js/dist/ical.js"
    else:
        npm = shutil.which("npm")
        if npm is None:
            sys.exit("npm isn't on PATH; install Node.js or pass --icaljs")
        subprocess.run(
            [
                npm,
                "install",
                "--prefix",
                str(workdir),
                "--no-save",
                "--no-audit",
                "--no-fund",
                "--ignore-scripts",
                f"ical.js@{ICALJS_VERSION}",
            ],
            check=True,
            stdout=subprocess.DEVNULL,
        )
        path = workdir / "node_modules/ical.js/dist/ical.js"
    version = json.loads((path.parent.parent / "package.json").read_text())["version"]
    if version != ICALJS_VERSION:
        sys.exit(f"ical.js {version} at {path}; the fixtures pin {ICALJS_VERSION}")
    return path


def run_icaljs(module: Path, cases: list[Case]) -> dict[str, dict]:
    node = shutil.which("node")
    if node is None:
        sys.exit("node isn't on PATH")
    payload = []
    for case in cases:
        floating = floating_equivalent(case)
        payload.append(
            {
                "id": case.id,
                "kind": floating.kind,
                "start": floating.start,
                "rule": floating.rule,
                "before": floating.window_before,
                "limit": 5000,
            }
        )
    done = subprocess.run(
        [node, str(ICALJS_RUNNER), str(module)],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        check=True,
    )
    return {result["id"]: result for result in json.loads(done.stdout)}


def icaljs_dates(case: Case, result: dict) -> list[str] | None:
    if "error" in result:
        return None
    floating = floating_equivalent(case)
    dates = result["dates"]
    if floating.window_from:
        dates = [d for d in dates if d >= floating.window_from]
    return dates


# ---------------------------------------------------------------------------------------------
# Fixtures


@dataclasses.dataclass
class Report:
    divergences: dict[str, list[str]] = dataclasses.field(default_factory=lambda: defaultdict(list))
    icaljs_vs_expected: list[str] = dataclasses.field(default_factory=list)
    icaljs_vs_dateutil: list[str] = dataclasses.field(default_factory=list)


def fixture(case: Case, icaljs: dict | None, report: Report) -> dict:
    series = Series(case)
    show = lambda values: [series.show(v) for v in values]  # noqa: E731
    expected = show(expand(series, case.rule, OURS))
    oracle = show(dateutil_raw(series))
    emulated = show(expand(series, case.rule, DATEUTIL))
    if emulated != oracle:
        raise AssertionError(f"{case.id}: the dateutil emulation drifted\n{emulated}\n{oracle}")

    divergence = None
    if case.expected_override is not None:
        if not case.override_reason:
            raise ValueError(f"{case.id}: expected_override needs override_reason")
        expected = list(case.expected_override)
        if expected != oracle:
            divergence = case.override_reason
            report.divergences["expected_override"].append(case.id)
    elif expected != oracle:
        notes = []
        for switch in SWITCHES:
            other = show(expand(series, case.rule, dataclasses.replace(OURS, **{switch: False})))
            if other != expected:
                notes.append(explain(series, switch, expected, other))
                report.divergences[switch].append(case.id)
        if not notes:
            raise AssertionError(f"{case.id}: differs from dateutil for no known reason")
        divergence = " ".join(notes)

    if len(expected) > MAX_EXPECTED:
        raise ValueError(f"{case.id}: {len(expected)} dates; keep cases under {MAX_EXPECTED}")
    if case.rfc_listed is not None:
        walls = [d[:16] for d in expected[case.rfc_unlisted :]]
        if (walls == list(case.rfc_listed)) != case.rfc_matches:
            raise AssertionError(
                f"{case.id}: RFC 5545 lists\n{list(case.rfc_listed)}\nwe give\n{walls}"
            )

    out: dict = {"id": case.id, "title": case.title, "source": case.source, "kind": case.kind}
    if case.kind == "timed":
        out["timeZone"] = case.time_zone
    out["start"] = case.start
    out["rule"] = case.rule
    window = {}
    if case.window_from:
        window["from"] = case.window_from
    if case.window_before:
        window["before"] = case.window_before
    if window:
        out["window"] = window
    if case.rfc_note:
        out["note"] = case.rfc_note
    out["expected"] = expected
    if divergence is not None:
        out["oracle"] = oracle
        out["divergence"] = divergence

    if icaljs is not None:
        floating = floating_equivalent(case)
        flat = Series(floating)
        flat_show = lambda values: [flat.show(v) for v in values]  # noqa: E731
        reference = flat_show(expand(flat, floating.rule, OURS))
        theirs = icaljs_dates(case, icaljs)
        if theirs != flat_show(dateutil_raw(flat)):
            report.icaljs_vs_dateutil.append(case.id)
        if theirs != reference:
            report.icaljs_vs_expected.append(case.id)
            out["secondOracle"] = theirs if theirs is not None else []
            out["secondOracleNote"] = icaljs_note(case, flat, icaljs, theirs, reference)
    return out


def icaljs_note(
    case: Case, flat: Series, result: dict, theirs: list[str] | None, reference: list[str]
) -> str:
    if case.icaljs_note or case.id in ICALJS_NOTES:
        return case.icaljs_note or ICALJS_NOTES[case.id]
    if theirs is None:
        if result.get("timedOut"):
            return f"ical.js {ICALJS_VERSION} gives no result within 5 s: its iterator loops."
        return f"ical.js {ICALJS_VERSION} throws: {result['error']}"
    if not result.get("complete", True):
        return f"ical.js {ICALJS_VERSION} hadn't finished after 5000 dates."
    flat_show = lambda values: [flat.show(v) for v in values]  # noqa: E731
    for switch in SWITCHES:
        if switch in ICALJS_SWITCH_NOTES:
            other = flat_show(
                expand(flat, flat.case.rule, dataclasses.replace(OURS, **{switch: False}))
            )
            if other == theirs and other != reference:
                return ICALJS_SWITCH_NOTES[switch]
    UNEXPLAINED.append(f"{case.id}\n  ical.js:  {theirs}\n  expected: {reference}")
    return "UNEXPLAINED"


UNEXPLAINED: list[str] = []


def dump(value, indent: int = 0, prefix: str = "", suffix: str = "") -> list[str]:
    """JSON as oxfmt (`vp fmt`) prints it: objects expanded, arrays on one line when they fit."""
    pad = " " * indent
    if isinstance(value, dict):
        lines = [f"{pad}{prefix}{{"]
        items = list(value.items())
        for index, (key, item) in enumerate(items):
            comma = "," if index < len(items) - 1 else ""
            lines += dump(item, indent + 2, json.dumps(key, ensure_ascii=False) + ": ", comma)
        return lines + [f"{pad}}}{suffix}"]
    if isinstance(value, list):
        if all(not isinstance(item, (dict, list)) for item in value):
            items = ", ".join(json.dumps(item, ensure_ascii=False) for item in value)
            line = f"{pad}{prefix}[{items}]{suffix}"
            if len(line) <= 100:
                return [line]
        lines = [f"{pad}{prefix}["]
        for index, item in enumerate(value):
            lines += dump(item, indent + 2, "", "," if index < len(value) - 1 else "")
        return lines + [f"{pad}]{suffix}"]
    return [f"{pad}{prefix}{json.dumps(value, ensure_ascii=False)}{suffix}"]


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--check", action="store_true", help="fail if the fixtures are out of date")
    parser.add_argument(
        "--icaljs",
        help=f"ical.js {ICALJS_VERSION}: its dist/ical.js or a directory with node_modules/ical.js "
        "(default: npm-install it into a temporary directory)",
    )
    args = parser.parse_args()

    files = {"rfc5545": rfc5545_cases(), "dst": dst_cases(), "coverage": coverage_cases()}
    ids = [case.id for cases in files.values() for case in cases]
    duplicates = sorted({i for i in ids if ids.count(i) > 1})
    if duplicates:
        sys.exit(f"duplicate ids: {duplicates}")

    report = Report()
    stale = []
    texts = {}
    with tempfile.TemporaryDirectory(prefix="recurrence-oracle-") as workdir:
        module = find_icaljs(args.icaljs, Path(workdir))
        for name, cases in files.items():
            icaljs = run_icaljs(module, cases)
            document = {
                "generator": GENERATOR,
                "oracle": f"python-dateutil {dateutil.__version__}",
                "secondOracle": f"ical.js {ICALJS_VERSION}",
                "timeZoneData": f"IANA {tzdata.IANA_VERSION} (tzdata {TZDATA_VERSION})",
                "cases": [fixture(case, icaljs[case.id], report) for case in cases],
            }
            texts[FIXTURES / f"{name}.json"] = "\n".join(dump(document)) + "\n"
            print(f"{name}.json: {len(cases)} cases", file=sys.stderr)

    print("divergences from python-dateutil:", file=sys.stderr)
    for switch, ids in report.divergences.items():
        print(f"  {switch} ({len(ids)}): {', '.join(ids)}", file=sys.stderr)
    print(
        f"ical.js differs from expected ({len(report.icaljs_vs_expected)}): "
        f"{', '.join(report.icaljs_vs_expected)}",
        file=sys.stderr,
    )
    print(
        f"ical.js differs from python-dateutil ({len(report.icaljs_vs_dateutil)}): "
        f"{', '.join(report.icaljs_vs_dateutil)}",
        file=sys.stderr,
    )
    if UNEXPLAINED:
        sys.exit(
            "ical.js disagrees for no known reason; add icaljs_note:\n" + "\n".join(UNEXPLAINED)
        )
    for path, text in texts.items():
        if args.check:
            if not path.exists() or path.read_text() != text:
                stale.append(str(path.relative_to(ROOT)))
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text)
    if stale:
        sys.exit(f"out of date: {', '.join(stale)}; run uv run {GENERATOR}")


if __name__ == "__main__":
    main()
