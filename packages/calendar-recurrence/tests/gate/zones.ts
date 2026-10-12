import { timedSeries, type Event } from "./calendar";

/** A timed series of the matrix, with the days its rule repeats on read without the engine. */
export interface SeriesSpec {
  readonly id: string;
  /** How many times it repeats in 2026, counted by hand from the calendar. */
  readonly in2026: number;
  readonly minutes: number;
  /** Whether the rule repeats on a date of the series' zone, `start`'s date and later. */
  readonly on: (date: Temporal.PlainDate) => boolean;
  readonly rule: string;
  /** The first occurrence's wall time in the series' zone; every occurrence repeats at its time. */
  readonly start: string;
}

export interface SeriesZone {
  readonly series: readonly SeriesSpec[];
  readonly timeZone: string;
  /** 2026's two offset changes, in order, as `instant offsets: wall time before → after`. */
  readonly transitions: readonly [string, string];
  /** The Mondays of the weeks holding them, in the zone's own dates. */
  readonly weeks: readonly [string, string];
}

const everyDay = () => true;
const weekdays =
  (...days: number[]) =>
  (date: Temporal.PlainDate) =>
    days.includes(date.dayOfWeek);
const lastSunday = (date: Temporal.PlainDate) =>
  date.dayOfWeek === 7 && date.add({ days: 7 }).month !== date.month;

// Most series start on Monday 5 January, which leaves 361 days of 2026: 52 Mondays, 52 Wednesdays
// and 51 Fridays among them.
const daily: SeriesSpec = {
  id: "daily",
  in2026: 361,
  minutes: 60,
  on: everyDay,
  rule: "FREQ=DAILY",
  start: "2026-01-05T09:00",
};
// Monday, Wednesday and Friday never fall on 2026's offset changes, so these keep their time.
const mwf: SeriesSpec = {
  id: "mwf",
  in2026: 155,
  minutes: 60,
  on: weekdays(1, 3, 5),
  rule: "FREQ=WEEKLY;BYDAY=MO,WE,FR",
  start: "2026-01-05T02:30",
};
const nightly = (id: string, start: string): SeriesSpec => ({
  id,
  in2026: 361,
  minutes: 30,
  on: everyDay,
  rule: "FREQ=DAILY",
  start: `2026-01-05T${start}`,
});
// Three hours across the early Sunday hours New York, Lord Howe and Sydney change their clocks in;
// 52 Sundays from 4 January.
const sunday: SeriesSpec = {
  id: "sunday",
  in2026: 52,
  minutes: 180,
  on: weekdays(7),
  rule: "FREQ=WEEKLY;BYDAY=SU",
  start: "2026-01-04T01:00",
};

export const berlin: SeriesZone = {
  series: [
    daily,
    mwf,
    // In the gap in March and in the repeated hour in October.
    nightly("night", "02:30"),
    // The last Sunday of March and of October is when Europe changes its clocks; 12 in 2026.
    {
      id: "last-sunday",
      in2026: 12,
      minutes: 180,
      on: lastSunday,
      rule: "FREQ=MONTHLY;BYDAY=-1SU",
      start: "2026-01-25T01:00",
    },
  ],
  timeZone: "Europe/Berlin",
  transitions: [
    "2026-03-29T01:00:00Z +01:00 → +02:00: 2026-03-29T02:00 → 2026-03-29T03:00",
    "2026-10-25T01:00:00Z +02:00 → +01:00: 2026-10-25T03:00 → 2026-10-25T02:00",
  ],
  weeks: ["2026-03-23", "2026-10-19"],
};

// New York skips 02:00–03:00 in March and repeats 01:00–02:00 in November.
export const newYork: SeriesZone = {
  series: [daily, mwf, nightly("gap", "02:30"), nightly("fold", "01:30"), sunday],
  timeZone: "America/New_York",
  transitions: [
    "2026-03-08T07:00:00Z -05:00 → -04:00: 2026-03-08T02:00 → 2026-03-08T03:00",
    "2026-11-01T06:00:00Z -04:00 → -05:00: 2026-11-01T02:00 → 2026-11-01T01:00",
  ],
  weeks: ["2026-03-02", "2026-10-26"],
};

// Lord Howe moves its clocks by half an hour: 02:00 → 01:30 in April, 02:00 → 02:30 in October.
export const lordHowe: SeriesZone = {
  series: [daily, mwf, nightly("gap", "02:15"), nightly("fold", "01:30"), sunday],
  timeZone: "Australia/Lord_Howe",
  transitions: [
    "2026-04-04T15:00:00Z +11:00 → +10:30: 2026-04-05T02:00 → 2026-04-05T01:30",
    "2026-10-03T15:30:00Z +10:30 → +11:00: 2026-10-04T02:00 → 2026-10-04T02:30",
  ],
  weeks: ["2026-03-30", "2026-09-28"],
};

// Santiago changes its clocks at midnight: Saturday 4 April's last hour happens twice, and
// Sunday 6 September starts at 01:00.
export const santiago: SeriesZone = {
  series: [
    daily,
    mwf,
    nightly("midnight", "00:00"),
    nightly("late", "23:30"),
    // Across midnight, and so across both changes; 52 Saturdays from 3 January.
    {
      id: "saturday",
      in2026: 52,
      minutes: 180,
      on: weekdays(6),
      rule: "FREQ=WEEKLY;BYDAY=SA",
      start: "2026-01-03T23:00",
    },
  ],
  timeZone: "America/Santiago",
  transitions: [
    "2026-04-05T03:00:00Z -03:00 → -04:00: 2026-04-05T00:00 → 2026-04-04T23:00",
    "2026-09-06T04:00:00Z -04:00 → -03:00: 2026-09-06T00:00 → 2026-09-06T01:00",
  ],
  weeks: ["2026-03-30", "2026-08-31"],
};

// Sydney repeats 02:00–03:00 in April and skips it in October.
export const sydney: SeriesZone = {
  series: [daily, mwf, nightly("night", "02:30"), sunday],
  timeZone: "Australia/Sydney",
  transitions: [
    "2026-04-04T16:00:00Z +11:00 → +10:00: 2026-04-05T03:00 → 2026-04-05T02:00",
    "2026-10-03T16:00:00Z +10:00 → +11:00: 2026-10-04T02:00 → 2026-10-04T03:00",
  ],
  weeks: ["2026-03-30", "2026-09-28"],
};

export const seriesZones: readonly SeriesZone[] = [berlin, newYork, lordHowe, santiago, sydney];

/** Kolkata is UTC+05:30 all year, so only the series' own clocks change there. */
export const kolkata = "Asia/Kolkata";

export const displayZones: readonly string[] = [
  ...seriesZones.map(({ timeZone }) => timeZone),
  kolkata,
];

export function eventsOf(zone: SeriesZone): Event[] {
  return zone.series.map(({ id, minutes, rule, start }) =>
    timedSeries(id, start, zone.timeZone, minutes, rule),
  );
}

/** The transition weeks of a series zone and of the zone it is shown in, by Monday. */
export function weeksOf(zone: SeriesZone, displayZone: string): string[] {
  const shown = seriesZones.find(({ timeZone }) => timeZone === displayZone);
  return [...new Set([...zone.weeks, ...(shown?.weeks ?? [])])].sort();
}
