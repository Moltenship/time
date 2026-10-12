import { parseIcs } from "@moltenship/ics";
import { describe, expect, test } from "vite-plus/test";

import { recurringEventsFromIcs } from "../../src";
import {
  allDayRowText,
  allDaySeries,
  createExpander,
  floatingSeries,
  show,
  timedSeries,
  timeGridText,
  weekView,
  type Event,
} from "./calendar";
import {
  berlin,
  displayZones,
  eventsOf,
  kolkata,
  lordHowe,
  newYork,
  santiago,
  seriesZones,
  sydney,
  type SeriesZone,
} from "./zones";

// The DST matrix of the recurrence gate (#155): series go through `createOccurrenceExpander` and
// `createOccurrenceAdapter` into core's snapshot and the week view's projection, as a calendar
// root shows them. Positions are worked out by hand from the zones' offsets; see
// `dst-invariants.test.ts` for the checks across every series zone and display zone.

/** Day columns by date, as `timeGridText` writes them. */
type Columns = Record<string, string>;

/** The seven columns of the week from `monday`, empty but for `shown`. */
function week(monday: string, shown: Columns = {}): Columns {
  return Object.fromEntries(
    Array.from({ length: 7 }, (_, index) => {
      const day = Temporal.PlainDate.from(monday).add({ days: index }).toString();
      return [day, shown[day] ?? ""];
    }),
  );
}

describe("the 2026 offset changes the matrix is built on", () => {
  test.each(seriesZones)("$timeZone", ({ timeZone, transitions }) => {
    // The wall time just before a change, which `ceil` rounds up to the minute, and just after.
    const wall = (zoned: Temporal.ZonedDateTime) =>
      zoned
        .toPlainDateTime()
        .round({ roundingMode: "ceil", smallestUnit: "minute" })
        .toString({ smallestUnit: "minute" });
    const found: string[] = [];
    let cursor = Temporal.ZonedDateTime.from({ day: 1, month: 1, timeZone, year: 2026 });
    for (;;) {
      const next = cursor.getTimeZoneTransition("next");
      if (next === null || next.year > 2026) break;
      const before = next.subtract({ nanoseconds: 1 });
      const offsets = `${before.offset} → ${next.offset}`;
      found.push(`${next.toInstant().toString()} ${offsets}: ${wall(before)} → ${wall(next)}`);
      cursor = next;
    }

    expect(found).toEqual(transitions);
  });

  test("Asia/Kolkata has none", () => {
    const start = Temporal.ZonedDateTime.from({ day: 1, month: 1, timeZone: kolkata, year: 2026 });
    expect(start.getTimeZoneTransition("next")).toBeNull();
  });
});

/**
 * The week view of each series zone's two transition weeks, in the zone and in Kolkata: every day
 * column's blocks as `top–bottom title` on the column's wall clock. A gap moves an occurrence
 * forward by the gap and a repeated time takes its first instant; every occurrence lasts exactly as
 * long as the first, so one across the change ends later or earlier on the wall clock, and a block
 * across a repeated hour covers it once.
 */
const weeks = new Map<SeriesZone, Record<string, Record<string, Columns>>>([
  [
    berlin,
    {
      // CET (+01:00) to CEST (+02:00): Kolkata is 4:30 ahead, then 3:30.
      "spring forward, Sunday 29 March": {
        "Europe/Berlin": {
          "2026-03-23": "02:30–03:30 mwf · 02:30–03:00 night · 09:00–10:00 daily",
          "2026-03-24": "02:30–03:00 night · 09:00–10:00 daily",
          "2026-03-25": "02:30–03:30 mwf · 02:30–03:00 night · 09:00–10:00 daily",
          "2026-03-26": "02:30–03:00 night · 09:00–10:00 daily",
          "2026-03-27": "02:30–03:30 mwf · 02:30–03:00 night · 09:00–10:00 daily",
          "2026-03-28": "02:30–03:00 night · 09:00–10:00 daily",
          // 01:00 CET for three hours ends at 05:00 CEST; 02:30 doesn't exist, so 03:30.
          "2026-03-29": "01:00–05:00 last-sunday · 03:30–04:00 night · 09:00–10:00 daily",
        },
        "Asia/Kolkata": {
          "2026-03-23": "07:00–08:00 mwf · 07:00–07:30 night · 13:30–14:30 daily",
          "2026-03-24": "07:00–07:30 night · 13:30–14:30 daily",
          "2026-03-25": "07:00–08:00 mwf · 07:00–07:30 night · 13:30–14:30 daily",
          "2026-03-26": "07:00–07:30 night · 13:30–14:30 daily",
          "2026-03-27": "07:00–08:00 mwf · 07:00–07:30 night · 13:30–14:30 daily",
          "2026-03-28": "07:00–07:30 night · 13:30–14:30 daily",
          // 03:30 CEST is the instant 02:30 CET would have been, so night stays at 07:00.
          "2026-03-29": "05:30–08:30 last-sunday · 07:00–07:30 night · 12:30–13:30 daily",
        },
      },
      // CEST (+02:00) to CET (+01:00): Kolkata is 3:30 ahead, then 4:30.
      "fall back, Sunday 25 October": {
        "Europe/Berlin": {
          "2026-10-19": "02:30–03:30 mwf · 02:30–03:00 night · 09:00–10:00 daily",
          "2026-10-20": "02:30–03:00 night · 09:00–10:00 daily",
          "2026-10-21": "02:30–03:30 mwf · 02:30–03:00 night · 09:00–10:00 daily",
          "2026-10-22": "02:30–03:00 night · 09:00–10:00 daily",
          "2026-10-23": "02:30–03:30 mwf · 02:30–03:00 night · 09:00–10:00 daily",
          "2026-10-24": "02:30–03:00 night · 09:00–10:00 daily",
          // 01:00 CEST for three hours ends at 03:00 CET; 02:30 is the first, CEST one.
          "2026-10-25": "01:00–03:00 last-sunday · 02:30–03:00 night · 09:00–10:00 daily",
        },
        "Asia/Kolkata": {
          "2026-10-19": "06:00–07:00 mwf · 06:00–06:30 night · 12:30–13:30 daily",
          "2026-10-20": "06:00–06:30 night · 12:30–13:30 daily",
          "2026-10-21": "06:00–07:00 mwf · 06:00–06:30 night · 12:30–13:30 daily",
          "2026-10-22": "06:00–06:30 night · 12:30–13:30 daily",
          "2026-10-23": "06:00–07:00 mwf · 06:00–06:30 night · 12:30–13:30 daily",
          "2026-10-24": "06:00–06:30 night · 12:30–13:30 daily",
          "2026-10-25": "04:30–07:30 last-sunday · 06:00–06:30 night · 13:30–14:30 daily",
        },
      },
    },
  ],
  [
    newYork,
    {
      // EST (-05:00) to EDT (-04:00): Kolkata is 10:30 ahead, then 9:30.
      "spring forward, Sunday 8 March": {
        "America/New_York": {
          "2026-03-02": "01:30–02:00 fold · 02:30–03:00 gap · 02:30–03:30 mwf · 09:00–10:00 daily",
          "2026-03-03": "01:30–02:00 fold · 02:30–03:00 gap · 09:00–10:00 daily",
          "2026-03-04": "01:30–02:00 fold · 02:30–03:00 gap · 02:30–03:30 mwf · 09:00–10:00 daily",
          "2026-03-05": "01:30–02:00 fold · 02:30–03:00 gap · 09:00–10:00 daily",
          "2026-03-06": "01:30–02:00 fold · 02:30–03:00 gap · 02:30–03:30 mwf · 09:00–10:00 daily",
          "2026-03-07": "01:30–02:00 fold · 02:30–03:00 gap · 09:00–10:00 daily",
          "2026-03-08":
            "01:00–05:00 sunday · 01:30–02:00 fold · 03:30–04:00 gap · 09:00–10:00 daily",
        },
        "Asia/Kolkata": {
          "2026-03-02": "12:00–12:30 fold · 13:00–13:30 gap · 13:00–14:00 mwf · 19:30–20:30 daily",
          "2026-03-03": "12:00–12:30 fold · 13:00–13:30 gap · 19:30–20:30 daily",
          "2026-03-04": "12:00–12:30 fold · 13:00–13:30 gap · 13:00–14:00 mwf · 19:30–20:30 daily",
          "2026-03-05": "12:00–12:30 fold · 13:00–13:30 gap · 19:30–20:30 daily",
          "2026-03-06": "12:00–12:30 fold · 13:00–13:30 gap · 13:00–14:00 mwf · 19:30–20:30 daily",
          "2026-03-07": "12:00–12:30 fold · 13:00–13:30 gap · 19:30–20:30 daily",
          "2026-03-08":
            "11:30–14:30 sunday · 12:00–12:30 fold · 13:00–13:30 gap · 18:30–19:30 daily",
        },
      },
      // EDT (-04:00) to EST (-05:00): Kolkata is 9:30 ahead, then 10:30.
      "fall back, Sunday 1 November": {
        "America/New_York": {
          "2026-10-26": "01:30–02:00 fold · 02:30–03:00 gap · 02:30–03:30 mwf · 09:00–10:00 daily",
          "2026-10-27": "01:30–02:00 fold · 02:30–03:00 gap · 09:00–10:00 daily",
          "2026-10-28": "01:30–02:00 fold · 02:30–03:00 gap · 02:30–03:30 mwf · 09:00–10:00 daily",
          "2026-10-29": "01:30–02:00 fold · 02:30–03:00 gap · 09:00–10:00 daily",
          "2026-10-30": "01:30–02:00 fold · 02:30–03:00 gap · 02:30–03:30 mwf · 09:00–10:00 daily",
          "2026-10-31": "01:30–02:00 fold · 02:30–03:00 gap · 09:00–10:00 daily",
          "2026-11-01":
            "01:00–03:00 sunday · 01:30–02:00 fold · 02:30–03:00 gap · 09:00–10:00 daily",
        },
        "Asia/Kolkata": {
          "2026-10-26": "11:00–11:30 fold · 12:00–12:30 gap · 12:00–13:00 mwf · 18:30–19:30 daily",
          "2026-10-27": "11:00–11:30 fold · 12:00–12:30 gap · 18:30–19:30 daily",
          "2026-10-28": "11:00–11:30 fold · 12:00–12:30 gap · 12:00–13:00 mwf · 18:30–19:30 daily",
          "2026-10-29": "11:00–11:30 fold · 12:00–12:30 gap · 18:30–19:30 daily",
          "2026-10-30": "11:00–11:30 fold · 12:00–12:30 gap · 12:00–13:00 mwf · 18:30–19:30 daily",
          "2026-10-31": "11:00–11:30 fold · 12:00–12:30 gap · 18:30–19:30 daily",
          "2026-11-01":
            "10:30–13:30 sunday · 11:00–11:30 fold · 13:00–13:30 gap · 19:30–20:30 daily",
        },
      },
    },
  ],
  [
    lordHowe,
    {
      // +11:00 to +10:30: Kolkata is 5:30 behind, then 5:00, so early hours land the day before.
      "fall back, Sunday 5 April": {
        "Australia/Lord_Howe": {
          "2026-03-30": "01:30–02:00 fold · 02:15–02:45 gap · 02:30–03:30 mwf · 09:00–10:00 daily",
          "2026-03-31": "01:30–02:00 fold · 02:15–02:45 gap · 09:00–10:00 daily",
          "2026-04-01": "01:30–02:00 fold · 02:15–02:45 gap · 02:30–03:30 mwf · 09:00–10:00 daily",
          "2026-04-02": "01:30–02:00 fold · 02:15–02:45 gap · 09:00–10:00 daily",
          "2026-04-03": "01:30–02:00 fold · 02:15–02:45 gap · 02:30–03:30 mwf · 09:00–10:00 daily",
          "2026-04-04": "01:30–02:00 fold · 02:15–02:45 gap · 09:00–10:00 daily",
          // 01:00 +11:00 for three hours ends at 03:30 +10:30.
          "2026-04-05":
            "01:00–03:30 sunday · 01:30–02:00 fold · 02:15–02:45 gap · 09:00–10:00 daily",
        },
        "Asia/Kolkata": {
          "2026-03-30": "03:30–04:30 daily · 20:00–20:30 fold · 20:45–21:15 gap",
          "2026-03-31": "03:30–04:30 daily · 20:00–20:30 fold · 20:45–21:15 gap · 21:00–22:00 mwf",
          "2026-04-01": "03:30–04:30 daily · 20:00–20:30 fold · 20:45–21:15 gap",
          "2026-04-02": "03:30–04:30 daily · 20:00–20:30 fold · 20:45–21:15 gap · 21:00–22:00 mwf",
          "2026-04-03": "03:30–04:30 daily · 20:00–20:30 fold · 20:45–21:15 gap",
          // Lord Howe's Sunday 5 April: its 01:30 at +11:00, its 02:15 at +10:30.
          "2026-04-04":
            "03:30–04:30 daily · 19:30–22:30 sunday · 20:00–20:30 fold · 21:15–21:45 gap",
          // Lord Howe's Monday 6 April, its Monday occurrence of mwf included.
          "2026-04-05": "04:00–05:00 daily · 20:30–21:00 fold · 21:15–21:45 gap · 21:30–22:30 mwf",
        },
      },
      // +10:30 to +11:00: 02:15 doesn't exist on 4 October, so 02:45.
      "spring forward, Sunday 4 October": {
        "Australia/Lord_Howe": {
          "2026-09-28": "01:30–02:00 fold · 02:15–02:45 gap · 02:30–03:30 mwf · 09:00–10:00 daily",
          "2026-09-29": "01:30–02:00 fold · 02:15–02:45 gap · 09:00–10:00 daily",
          "2026-09-30": "01:30–02:00 fold · 02:15–02:45 gap · 02:30–03:30 mwf · 09:00–10:00 daily",
          "2026-10-01": "01:30–02:00 fold · 02:15–02:45 gap · 09:00–10:00 daily",
          "2026-10-02": "01:30–02:00 fold · 02:15–02:45 gap · 02:30–03:30 mwf · 09:00–10:00 daily",
          "2026-10-03": "01:30–02:00 fold · 02:15–02:45 gap · 09:00–10:00 daily",
          "2026-10-04":
            "01:00–04:30 sunday · 01:30–02:00 fold · 02:45–03:15 gap · 09:00–10:00 daily",
        },
        "Asia/Kolkata": {
          "2026-09-28": "04:00–05:00 daily · 20:30–21:00 fold · 21:15–21:45 gap",
          "2026-09-29": "04:00–05:00 daily · 20:30–21:00 fold · 21:15–21:45 gap · 21:30–22:30 mwf",
          "2026-09-30": "04:00–05:00 daily · 20:30–21:00 fold · 21:15–21:45 gap",
          "2026-10-01": "04:00–05:00 daily · 20:30–21:00 fold · 21:15–21:45 gap · 21:30–22:30 mwf",
          "2026-10-02": "04:00–05:00 daily · 20:30–21:00 fold · 21:15–21:45 gap",
          "2026-10-03":
            "04:00–05:00 daily · 20:00–23:00 sunday · 20:30–21:00 fold · 21:15–21:45 gap",
          "2026-10-04": "03:30–04:30 daily · 20:00–20:30 fold · 20:45–21:15 gap · 21:00–22:00 mwf",
        },
      },
    },
  ],
  [
    santiago,
    {
      // -03:00 to -04:00 at midnight: Saturday's 23:00–24:00 happens twice. Kolkata is 8:30
      // ahead, then 9:30, so late evenings land the next day.
      "fall back, Saturday 4 April": {
        "America/Santiago": {
          "2026-03-30":
            "00:00–00:30 midnight · 02:30–03:30 mwf · 09:00–10:00 daily · 23:30–24:00 late",
          "2026-03-31": "00:00–00:30 midnight · 09:00–10:00 daily · 23:30–24:00 late",
          "2026-04-01":
            "00:00–00:30 midnight · 02:30–03:30 mwf · 09:00–10:00 daily · 23:30–24:00 late",
          "2026-04-02": "00:00–00:30 midnight · 09:00–10:00 daily · 23:30–24:00 late",
          "2026-04-03":
            "00:00–00:30 midnight · 02:30–03:30 mwf · 09:00–10:00 daily · 23:30–24:00 late",
          // 23:00 -03:00 for three hours ends at 01:00 -04:00; 23:30 is the first, -03:00 one.
          "2026-04-04":
            "00:00–00:30 midnight · 09:00–10:00 daily · 23:00–24:00 saturday · 23:30–24:00 late",
          "2026-04-05":
            "00:00–00:30 midnight · 00:00–01:00 saturday · 09:00–10:00 daily · 23:30–24:00 late",
        },
        "Asia/Kolkata": {
          "2026-03-30":
            "08:00–08:30 late · 08:30–09:00 midnight · 11:00–12:00 mwf · 17:30–18:30 daily",
          "2026-03-31": "08:00–08:30 late · 08:30–09:00 midnight · 17:30–18:30 daily",
          "2026-04-01":
            "08:00–08:30 late · 08:30–09:00 midnight · 11:00–12:00 mwf · 17:30–18:30 daily",
          "2026-04-02": "08:00–08:30 late · 08:30–09:00 midnight · 17:30–18:30 daily",
          "2026-04-03":
            "08:00–08:30 late · 08:30–09:00 midnight · 11:00–12:00 mwf · 17:30–18:30 daily",
          "2026-04-04": "08:00–08:30 late · 08:30–09:00 midnight · 17:30–18:30 daily",
          "2026-04-05":
            "07:30–10:30 saturday · 08:00–08:30 late · 09:30–10:00 midnight · 18:30–19:30 daily",
        },
      },
      // -04:00 to -03:00 at midnight: Sunday 6 September starts at 01:00, so 00:00 moves there.
      "spring forward, Sunday 6 September": {
        "America/Santiago": {
          "2026-08-31":
            "00:00–00:30 midnight · 02:30–03:30 mwf · 09:00–10:00 daily · 23:30–24:00 late",
          "2026-09-01": "00:00–00:30 midnight · 09:00–10:00 daily · 23:30–24:00 late",
          "2026-09-02":
            "00:00–00:30 midnight · 02:30–03:30 mwf · 09:00–10:00 daily · 23:30–24:00 late",
          "2026-09-03": "00:00–00:30 midnight · 09:00–10:00 daily · 23:30–24:00 late",
          "2026-09-04":
            "00:00–00:30 midnight · 02:30–03:30 mwf · 09:00–10:00 daily · 23:30–24:00 late",
          "2026-09-05":
            "00:00–00:30 midnight · 09:00–10:00 daily · 23:00–24:00 saturday · 23:30–24:00 late",
          // 23:00 -04:00 for three hours ends at 03:00 -03:00.
          "2026-09-06":
            "01:00–01:30 midnight · 01:00–03:00 saturday · 09:00–10:00 daily · 23:30–24:00 late",
        },
        "Asia/Kolkata": {
          "2026-08-31":
            "09:00–09:30 late · 09:30–10:00 midnight · 12:00–13:00 mwf · 18:30–19:30 daily",
          "2026-09-01": "09:00–09:30 late · 09:30–10:00 midnight · 18:30–19:30 daily",
          "2026-09-02":
            "09:00–09:30 late · 09:30–10:00 midnight · 12:00–13:00 mwf · 18:30–19:30 daily",
          "2026-09-03": "09:00–09:30 late · 09:30–10:00 midnight · 18:30–19:30 daily",
          "2026-09-04":
            "09:00–09:30 late · 09:30–10:00 midnight · 12:00–13:00 mwf · 18:30–19:30 daily",
          "2026-09-05": "09:00–09:30 late · 09:30–10:00 midnight · 18:30–19:30 daily",
          "2026-09-06":
            "08:30–11:30 saturday · 09:00–09:30 late · 09:30–10:00 midnight · 17:30–18:30 daily",
        },
      },
    },
  ],
  [
    sydney,
    {
      // +11:00 to +10:00: Kolkata is 5:30 behind, then 4:30.
      "fall back, Sunday 5 April": {
        "Australia/Sydney": {
          "2026-03-30": "02:30–03:30 mwf · 02:30–03:00 night · 09:00–10:00 daily",
          "2026-03-31": "02:30–03:00 night · 09:00–10:00 daily",
          "2026-04-01": "02:30–03:30 mwf · 02:30–03:00 night · 09:00–10:00 daily",
          "2026-04-02": "02:30–03:00 night · 09:00–10:00 daily",
          "2026-04-03": "02:30–03:30 mwf · 02:30–03:00 night · 09:00–10:00 daily",
          "2026-04-04": "02:30–03:00 night · 09:00–10:00 daily",
          // 01:00 +11:00 for three hours ends at 03:00 +10:00.
          "2026-04-05": "01:00–03:00 sunday · 02:30–03:00 night · 09:00–10:00 daily",
        },
        "Asia/Kolkata": {
          "2026-03-30": "03:30–04:30 daily · 21:00–21:30 night",
          "2026-03-31": "03:30–04:30 daily · 21:00–22:00 mwf · 21:00–21:30 night",
          "2026-04-01": "03:30–04:30 daily · 21:00–21:30 night",
          "2026-04-02": "03:30–04:30 daily · 21:00–22:00 mwf · 21:00–21:30 night",
          "2026-04-03": "03:30–04:30 daily · 21:00–21:30 night",
          "2026-04-04": "03:30–04:30 daily · 19:30–22:30 sunday · 21:00–21:30 night",
          "2026-04-05": "04:30–05:30 daily · 22:00–23:00 mwf · 22:00–22:30 night",
        },
      },
      // +10:00 to +11:00: 02:30 doesn't exist on 4 October, so 03:30.
      "spring forward, Sunday 4 October": {
        "Australia/Sydney": {
          "2026-09-28": "02:30–03:30 mwf · 02:30–03:00 night · 09:00–10:00 daily",
          "2026-09-29": "02:30–03:00 night · 09:00–10:00 daily",
          "2026-09-30": "02:30–03:30 mwf · 02:30–03:00 night · 09:00–10:00 daily",
          "2026-10-01": "02:30–03:00 night · 09:00–10:00 daily",
          "2026-10-02": "02:30–03:30 mwf · 02:30–03:00 night · 09:00–10:00 daily",
          "2026-10-03": "02:30–03:00 night · 09:00–10:00 daily",
          "2026-10-04": "01:00–05:00 sunday · 03:30–04:00 night · 09:00–10:00 daily",
        },
        "Asia/Kolkata": {
          "2026-09-28": "04:30–05:30 daily · 22:00–22:30 night",
          "2026-09-29": "04:30–05:30 daily · 22:00–23:00 mwf · 22:00–22:30 night",
          "2026-09-30": "04:30–05:30 daily · 22:00–22:30 night",
          "2026-10-01": "04:30–05:30 daily · 22:00–23:00 mwf · 22:00–22:30 night",
          "2026-10-02": "04:30–05:30 daily · 22:00–22:30 night",
          "2026-10-03": "04:30–05:30 daily · 20:30–23:30 sunday · 22:00–22:30 night",
          "2026-10-04": "03:30–04:30 daily · 21:00–22:00 mwf · 21:00–21:30 night",
        },
      },
    },
  ],
]);

/** The IDs of the occurrences on each transition day, top to bottom in the zone's own week view. */
const transitionDays = new Map<SeriesZone, Record<string, readonly string[]>>([
  [
    berlin,
    {
      "2026-03-29": [
        "last-sunday::2026-03-29T00:00:00Z",
        "night::2026-03-29T01:30:00Z",
        "daily::2026-03-29T07:00:00Z",
      ],
      "2026-10-25": [
        "last-sunday::2026-10-24T23:00:00Z",
        "night::2026-10-25T00:30:00Z",
        "daily::2026-10-25T08:00:00Z",
      ],
    },
  ],
  [
    newYork,
    {
      "2026-03-08": [
        "sunday::2026-03-08T06:00:00Z",
        "fold::2026-03-08T06:30:00Z",
        "gap::2026-03-08T07:30:00Z",
        "daily::2026-03-08T13:00:00Z",
      ],
      "2026-11-01": [
        "sunday::2026-11-01T05:00:00Z",
        "fold::2026-11-01T05:30:00Z",
        "gap::2026-11-01T07:30:00Z",
        "daily::2026-11-01T14:00:00Z",
      ],
    },
  ],
  [
    lordHowe,
    {
      "2026-04-05": [
        "sunday::2026-04-04T14:00:00Z",
        "fold::2026-04-04T14:30:00Z",
        "gap::2026-04-04T15:45:00Z",
        "daily::2026-04-04T22:30:00Z",
      ],
      "2026-10-04": [
        "sunday::2026-10-03T14:30:00Z",
        "fold::2026-10-03T15:00:00Z",
        "gap::2026-10-03T15:45:00Z",
        "daily::2026-10-03T22:00:00Z",
      ],
    },
  ],
  [
    santiago,
    {
      "2026-04-04": [
        "midnight::2026-04-04T03:00:00Z",
        "daily::2026-04-04T12:00:00Z",
        "saturday::2026-04-05T02:00:00Z",
        "late::2026-04-05T02:30:00Z",
      ],
      // Saturday's occurrence continues into the day, under the ID of its start.
      "2026-09-06": [
        "midnight::2026-09-06T04:00:00Z",
        "saturday::2026-09-06T03:00:00Z",
        "daily::2026-09-06T12:00:00Z",
        "late::2026-09-07T02:30:00Z",
      ],
    },
  ],
  [
    sydney,
    {
      "2026-04-05": [
        "sunday::2026-04-04T14:00:00Z",
        "night::2026-04-04T15:30:00Z",
        "daily::2026-04-04T23:00:00Z",
      ],
      "2026-10-04": [
        "sunday::2026-10-03T15:00:00Z",
        "night::2026-10-03T16:30:00Z",
        "daily::2026-10-03T22:00:00Z",
      ],
    },
  ],
]);

describe.each(seriesZones)("$timeZone series in the week view", (zone) => {
  const events = eventsOf(zone);
  // One expander per zone, kept across weeks and display zones as an application keeps one.
  const expander = createExpander();
  const cases = Object.entries(weeks.get(zone)!).flatMap(([week, shown]) =>
    Object.entries(shown).map(([timeZone, columns]) => ({ columns, timeZone, week })),
  );

  test.each(cases)("$week, shown in $timeZone", ({ columns, timeZone }) => {
    const monday = Object.keys(columns)[0]!;
    const { expansion, projection } = show(weekView, monday, timeZone, events, expander);

    expect(expansion.issues).toEqual([]);
    expect(timeGridText(projection)).toEqual(columns);
    expect(projection.allDay.segments).toEqual([]);
  });

  test("names each occurrence by its series and original start on the transition days", () => {
    for (const [day, ids] of Object.entries(transitionDays.get(zone)!)) {
      const { projection } = show(weekView, day, zone.timeZone, events, expander);
      const column = projection.days.find(({ column }) => column.date.toString() === day)!;
      const shown = column.events
        .toSorted(
          (left, right) =>
            left.top - right.top ||
            (left.fragment.event.title < right.fragment.event.title ? -1 : 1),
        )
        .map(({ fragment }) => fragment.event.id);

      expect(shown).toEqual(ids);
    }
  });
});

describe("lengths across an offset change", () => {
  // Saturday noon to Sunday noon in Berlin: lasting exactly as long as the first, 24 hours, or a
  // nominal day (DURATION:P1D), which is 23 hours on 28 March and 25 on 24 October.
  const exact = timedSeries("exact", "2026-01-03T12:00", "Europe/Berlin", 24 * 60, "FREQ=WEEKLY");
  const noon: Event = {
    ...timedSeries("noon", "2026-01-03T12:00", "Europe/Berlin", 24 * 60, "FREQ=WEEKLY"),
    recurrence: { duration: Temporal.Duration.from({ days: 1 }), rule: exact.recurrence!.rule! },
  };
  const expander = createExpander();

  test.each([
    {
      allDay: ["2026-03-28 exact (2 days)"],
      // 23 hours is less than a day, so the time grid puts the nominal one in its columns.
      columns: week("2026-03-23", {
        "2026-03-28": "12:00–24:00 noon",
        "2026-03-29": "00:00–12:00 noon",
      }),
      timeZone: "Europe/Berlin",
    },
    {
      allDay: ["2026-03-28 exact (2 days)"],
      columns: week("2026-03-23", {
        "2026-03-28": "16:30–24:00 noon",
        "2026-03-29": "00:00–15:30 noon",
      }),
      timeZone: kolkata,
    },
    {
      allDay: ["2026-10-24 exact (2 days)", "2026-10-24 noon (2 days)"],
      columns: week("2026-10-19"),
      timeZone: "Europe/Berlin",
    },
    {
      allDay: ["2026-10-24 exact (2 days)", "2026-10-24 noon (2 days)"],
      columns: week("2026-10-19"),
      timeZone: kolkata,
    },
  ])("in the week of a change, shown in $timeZone", ({ allDay, columns, timeZone }) => {
    const monday = Object.keys(columns)[0]!;
    const { expansion, projection } = show(weekView, monday, timeZone, [exact, noon], expander);

    expect(expansion.issues).toEqual([]);
    expect(allDayRowText(projection)).toEqual(allDay);
    expect(timeGridText(projection)).toEqual(columns);
  });

  test("end on the wall clock or the exact time, under the IDs of their starts", () => {
    const { expansion } = show(weekView, "2026-03-23", "Europe/Berlin", [exact, noon], expander);
    const fall = show(weekView, "2026-10-19", "Europe/Berlin", [exact, noon], expander);

    expect(
      [...expansion.occurrences, ...fall.expansion.occurrences].map(
        ({ id, interval }) => `${id} → ${String(interval.end)}`,
      ),
    ).toEqual([
      // 13:00 CEST and 12:00 CEST.
      "exact::2026-03-28T11:00:00Z → 2026-03-29T11:00:00Z",
      "noon::2026-03-28T11:00:00Z → 2026-03-29T10:00:00Z",
      // 11:00 CET and 12:00 CET.
      "exact::2026-10-24T10:00:00Z → 2026-10-25T10:00:00Z",
      "noon::2026-10-24T10:00:00Z → 2026-10-25T11:00:00Z",
    ]);
  });
});

describe("an iCalendar feed's series", () => {
  // Wall times as feeds write them: a DTSTART in New York's gap, which repeats at its written
  // 02:30, and an EXDATE at Berlin's skipped 02:30 and a RECURRENCE-ID at its repeated one, which
  // name the occurrences the gap moved and the fold's first instant.
  const feed = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Moltenship//DST matrix//EN",
    "BEGIN:VEVENT",
    "UID:standup",
    "SUMMARY:standup",
    "DTSTART;TZID=America/New_York:20260308T023000",
    "DURATION:PT30M",
    "RRULE:FREQ=WEEKLY",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:night",
    "SUMMARY:night",
    "DTSTART;TZID=Europe/Berlin:20260105T023000",
    "DTEND;TZID=Europe/Berlin:20260105T030000",
    "RRULE:FREQ=DAILY",
    "EXDATE;TZID=Europe/Berlin:20260329T023000",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:night",
    "SUMMARY:moved",
    "RECURRENCE-ID;TZID=Europe/Berlin:20261025T023000",
    "DTSTART;TZID=Europe/Berlin:20261025T050000",
    "DTEND;TZID=Europe/Berlin:20261025T053000",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const bridged = recurringEventsFromIcs(parseIcs(feed).calendars[0]!.events);
  const eventsOf = (uid: string): Event[] =>
    bridged.events
      .filter(({ data }) => data.uid === uid)
      .map((event) => ({ ...event, data: null }));
  const expander = createExpander();

  test("bridges without issues", () => {
    expect(bridged.issues).toEqual([]);
  });

  test.each([
    {
      columns: week("2026-03-02", { "2026-03-08": "03:30–04:00 standup" }),
      timeZone: "America/New_York",
      uid: "standup",
    },
    {
      columns: week("2026-03-09", { "2026-03-15": "02:30–03:00 standup" }),
      timeZone: "America/New_York",
      uid: "standup",
    },
    {
      columns: week("2026-03-23", {
        "2026-03-23": "02:30–03:00 night",
        "2026-03-24": "02:30–03:00 night",
        "2026-03-25": "02:30–03:00 night",
        "2026-03-26": "02:30–03:00 night",
        "2026-03-27": "02:30–03:00 night",
        "2026-03-28": "02:30–03:00 night",
      }),
      timeZone: "Europe/Berlin",
      uid: "night",
    },
    {
      columns: week("2026-10-19", {
        "2026-10-19": "02:30–03:00 night",
        "2026-10-20": "02:30–03:00 night",
        "2026-10-21": "02:30–03:00 night",
        "2026-10-22": "02:30–03:00 night",
        "2026-10-23": "02:30–03:00 night",
        "2026-10-24": "02:30–03:00 night",
        "2026-10-25": "05:00–05:30 moved",
      }),
      timeZone: "Europe/Berlin",
      uid: "night",
    },
  ])("$uid in a week of $timeZone's changes", ({ columns, timeZone, uid }) => {
    const monday = Object.keys(columns)[0]!;
    const { expansion, projection } = show(weekView, monday, timeZone, eventsOf(uid), expander);

    expect(expansion.issues).toEqual([]);
    expect(timeGridText(projection)).toEqual(columns);
  });

  test("keeps the moved occurrence under the ID of the fold's first instant", () => {
    const { expansion } = show(
      weekView,
      "2026-10-19",
      "Europe/Berlin",
      eventsOf("night"),
      expander,
    );

    expect(expansion.occurrences.map(({ id }) => id).slice(-2)).toEqual([
      "night::2026-10-24T00:30:00Z",
      "night::2026-10-25T00:30:00Z",
    ]);
    expect(expansion.occurrences.at(-1)?.recurrence?.override).toBeDefined();
  });
});

describe("all-day and floating series", () => {
  // Sundays all day, and 02:30 every night: inside the gap in Berlin, New York and Sydney, and in
  // the repeated hour in Berlin and Sydney, which no zone applies to them.
  const events = [
    allDaySeries("holiday", "2026-01-04", 1, "FREQ=WEEKLY;BYDAY=SU"),
    floatingSeries("floating", "2026-01-05T02:30", 30, "FREQ=DAILY"),
  ];
  const mondays = [...new Set(seriesZones.flatMap(({ weeks: mondays }) => mondays))].sort();

  test("sit on their dates and wall times in Berlin's spring-forward week", () => {
    const { expansion, projection } = show(weekView, "2026-03-23", "Europe/Berlin", events);

    expect(allDayRowText(projection)).toEqual(["2026-03-29 holiday"]);
    expect(timeGridText(projection)).toEqual({
      "2026-03-23": "02:30–03:00 floating",
      "2026-03-24": "02:30–03:00 floating",
      "2026-03-25": "02:30–03:00 floating",
      "2026-03-26": "02:30–03:00 floating",
      "2026-03-27": "02:30–03:00 floating",
      "2026-03-28": "02:30–03:00 floating",
      "2026-03-29": "02:30–03:00 floating",
    });
    expect(expansion.occurrences.map(({ id }) => id)).toContain("floating::2026-03-29T02:30:00");
    expect(expansion.occurrences.map(({ id }) => id)).toContain("holiday::2026-03-29");
  });

  test.each(displayZones)("don't move in %s, in any transition week", (timeZone) => {
    for (const monday of mondays) {
      const { expansion, projection } = show(weekView, monday, timeZone, events);
      const days = Array.from({ length: 7 }, (_, index) =>
        Temporal.PlainDate.from(monday).add({ days: index }).toString(),
      );

      expect(allDayRowText(projection)).toEqual([`${days[6]} holiday`]);
      expect(timeGridText(projection)).toEqual(
        Object.fromEntries(days.map((day) => [day, "02:30–03:00 floating"])),
      );
      expect(expansion.occurrences.map(({ id }) => id)).toEqual([
        `holiday::${days[6]}`,
        ...days.map((day) => `floating::${day}T02:30:00`),
      ]);
    }
  });
});
