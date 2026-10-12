import {
  getYearRange,
  navigateYear,
  resolveViewLoadRange,
  type CalendarEnvironmentBase,
  type CalendarViewStrategy,
} from "@moltenship/calendar-core";
import {
  parseRecurrenceRule,
  type OccurrenceRange,
  type RecurrenceDate,
  type RecurrenceRule,
  type RecurringCalendarEvent,
} from "@moltenship/calendar-recurrence";
import { BENCHMARK_FIXTURE_SEED, createRandom } from "fixtures";

export const RECURRENCE_SERIES_COUNT = 200;
/** Where the calendar shows the year. */
export const RECURRENCE_DISPLAY_TIME_ZONE = "Europe/Berlin";
/** The date the year view opens on. */
export const RECURRENCE_ANCHOR = Temporal.PlainDate.from("2026-08-01");

export type RecurrenceFixtureCategory =
  | "birthday"
  | "bi-weekly"
  | "chore"
  | "daily"
  | "monthly-day"
  | "monthly-weekday"
  | "quarterly"
  | "stand-up"
  | "weekly";

export interface RecurrenceFixtureData {
  readonly category: RecurrenceFixtureCategory;
  readonly ordinal: number;
}

export type RecurrenceFixtureEvent = RecurringCalendarEvent<RecurrenceFixtureData>;

export interface RecurrenceFixture {
  /** Each series' master, followed by its overrides. */
  readonly events: readonly RecurrenceFixtureEvent[];
  /** The year view's load range after navigating forward a year. */
  readonly nextYear: OccurrenceRange;
  readonly overrides: number;
  readonly seed: number;
  readonly series: number;
  /** The year view's load range for `RECURRENCE_ANCHOR`. */
  readonly year: OccurrenceRange;
}

export interface RecurrenceFixtureOptions {
  readonly seed?: number;
  readonly seriesCount?: number;
}

// Twenty series, repeated: a busy work calendar with a team's and family's calendars on top.
const cycle: readonly RecurrenceFixtureCategory[] = [
  "stand-up",
  "weekly",
  "birthday",
  "bi-weekly",
  "weekly",
  "monthly-day",
  "birthday",
  "weekly",
  "monthly-weekday",
  "bi-weekly",
  "birthday",
  "daily",
  "weekly",
  "monthly-weekday",
  "birthday",
  "bi-weekly",
  "weekly",
  "quarterly",
  "birthday",
  "chore",
];

// Half the timed series repeat in the display zone; the rest in four others, two with DST in the
// other hemisphere and Lord Howe's half-hour shift.
const timeZones = [
  "Europe/Berlin",
  "Europe/Berlin",
  "Europe/Berlin",
  "Europe/Berlin",
  "Europe/Berlin",
  "America/New_York",
  "America/New_York",
  "Asia/Kolkata",
  "Australia/Sydney",
  "Australia/Lord_Howe",
] as const;

const weekdays = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
const monthlyWeekdays = ["1MO", "2TU", "3WE", "4TH", "-1FR"] as const;
const firstOfYear = Temporal.PlainDate.from("2026-01-01");
const lastOfYear = Temporal.PlainDate.from("2026-12-31");

/** The year view (`registry/year-view`) shows `getYearRange` and keeps no dates ready around it. */
const yearView: Pick<CalendarViewStrategy<unknown>, "getLoadRange" | "getRange"> = {
  getRange: getYearRange,
};

/** The load range the year view asks for, resolved by core as the calendar root does. */
export function yearViewLoadRange(anchor: Temporal.PlainDate, timeZone: string): OccurrenceRange {
  const environment: CalendarEnvironmentBase = {
    direction: "ltr",
    disambiguation: "compatible",
    locale: "en-GB",
    timeZone,
    weekRules: { firstDay: 1, minimalDays: 4, weekend: [6, 7] },
  };
  const range = yearView.getRange(anchor, environment, undefined);
  return { range: resolveViewLoadRange(yearView, anchor, environment, undefined, range), timeZone };
}

type Random = ReturnType<typeof createRandom>;

const pick = <T>(random: Random, values: readonly T[]): T => values[random(values.length)]!;

function parseRule(text: string): RecurrenceRule {
  const { issues, rule } = parseRecurrenceRule(text);
  if (rule === undefined || issues.length > 0) throw new Error(`invalid-fixture-rule:${text}`);
  return rule;
}

/** A date in one of `years`; in 2026, only in its first half so the series shows in the year. */
function dateIn(random: Random, firstYear: number, lastYear: number): Temporal.PlainDate {
  const year = firstYear + random(lastYear - firstYear + 1);
  return Temporal.PlainDate.from({ day: 1, month: 1, year }).add({
    days: random(year === 2026 ? 180 : 365),
  });
}

/** The first Monday to Friday on or after `date`. */
function workday(date: Temporal.PlainDate): Temporal.PlainDate {
  return date.dayOfWeek <= 5 ? date : date.add({ days: 8 - date.dayOfWeek });
}

/** The `ordinal`th `weekday` (1 for Monday) of `month`'s month, from the end when negative. */
function nthWeekday(month: Temporal.PlainDate, weekday: number, ordinal: number) {
  const first = month.with({ day: 1 });
  if (ordinal > 0) {
    return first.add({ days: ((weekday - first.dayOfWeek + 7) % 7) + 7 * (ordinal - 1) });
  }
  const last = first.add({ months: 1 }).subtract({ days: 1 });
  return last.subtract({ days: (last.dayOfWeek - weekday + 7) % 7 });
}

/** BYDAY for a weekly series on `start`'s weekday and up to `extra` other workdays. */
function byDay(random: Random, start: Temporal.PlainDate, extra: number): string {
  const days = new Set([start.dayOfWeek]);
  for (let index = random(extra + 1); index > 0; index -= 1) days.add(1 + random(5));
  return [...days]
    .sort((left, right) => left - right)
    .map((day) => weekdays[day - 1])
    .join(",");
}

/** What a series is before its end, exceptions and overrides are added. */
interface SeriesShape {
  readonly kind: "all-day" | "floating" | "timed";
  /** Minutes long; all-day series last a day. */
  readonly minutes: number;
  readonly rule: string;
  /** The start's minutes after midnight. */
  readonly startMinute: number;
  readonly startDate: Temporal.PlainDate;
  /** Days between occurrences that `startDate` plus a multiple of it always lands on. */
  readonly stepDays?: number;
  readonly timeZone?: string;
  readonly title: string;
}

function shapeOf(
  category: RecurrenceFixtureCategory,
  index: number,
  random: Random,
  starts: { readonly firstYear: number; readonly lastYear: number },
): SeriesShape {
  const start = () => dateIn(random, starts.firstYear, starts.lastYear);
  const timed = () => ({ kind: "timed" as const, timeZone: pick(random, timeZones) });
  const businessMinute = () => 8 * 60 + 15 * random(40);

  switch (category) {
    case "stand-up":
      return {
        ...timed(),
        minutes: 15,
        rule: "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR",
        startDate: workday(start()),
        startMinute: 9 * 60 + 15 * random(5),
        stepDays: 7,
        title: "Stand-up",
      };
    case "daily": {
      if (index === 0) {
        // A nightly job in the hour Europe skips in March.
        return {
          kind: "timed",
          minutes: 30,
          rule: "FREQ=DAILY",
          startDate: Temporal.PlainDate.from("2015-01-05"),
          startMinute: 2 * 60 + 30,
          timeZone: "Europe/Berlin",
          title: "Nightly backup",
        };
      }
      const every = 1 + random(2);
      const floating = random(3) === 0;
      return {
        ...(floating ? { kind: "floating" as const } : timed()),
        minutes: floating ? 5 : 30,
        rule: every === 1 ? "FREQ=DAILY" : `FREQ=DAILY;INTERVAL=${every}`,
        startDate: start(),
        startMinute: floating ? 8 * 60 : 17 * 60 + 30,
        stepDays: every,
        title: floating ? "Medication" : "Daily review",
      };
    }
    case "weekly":
    case "bi-weekly": {
      const every = category === "weekly" ? 1 : 2;
      const startDate = workday(start());
      return {
        ...timed(),
        minutes: pick(random, [30, 45, 60, 90]),
        rule: `FREQ=WEEKLY${every === 1 ? "" : ";INTERVAL=2"};BYDAY=${byDay(random, startDate, every === 1 ? 2 : 1)}`,
        startDate,
        startMinute: businessMinute(),
        stepDays: 7 * every,
        title: pick(
          random,
          every === 1
            ? ["Team sync", "1:1", "Planning", "Design review", "Office hours", "Yoga"]
            : ["Sprint review", "Retro", "Mentoring", "Payroll check"],
        ),
      };
    }
    case "monthly-day": {
      const day = pick(random, [1, 15, 28, -1]);
      const month = start();
      const startDate =
        day > 0
          ? month.with({ day })
          : month.with({ day: 1 }).add({ months: 1 }).subtract({ days: 1 });
      const allDay = random(2) === 0;
      return {
        ...(allDay ? { kind: "all-day" as const } : timed()),
        minutes: 60,
        rule: `FREQ=MONTHLY;BYMONTHDAY=${day}`,
        startDate,
        startMinute: allDay ? 0 : businessMinute(),
        title: allDay ? "Rent due" : "Invoice run",
      };
    }
    case "monthly-weekday": {
      const weekday = pick(random, monthlyWeekdays);
      const ordinal = Number.parseInt(weekday, 10);
      const day = weekdays.indexOf(weekday.slice(-2) as (typeof weekdays)[number]) + 1;
      return {
        ...timed(),
        minutes: pick(random, [60, 90, 120]),
        rule: `FREQ=MONTHLY;BYDAY=${weekday}`,
        startDate: nthWeekday(start(), day, ordinal),
        startMinute: businessMinute(),
        title: pick(random, ["All hands", "Board meeting", "Book club", "Town hall"]),
      };
    }
    case "quarterly": {
      const firstMonday = random(2) === 0;
      const date = start();
      return {
        ...timed(),
        minutes: 120,
        rule: firstMonday ? "FREQ=YEARLY;BYMONTH=1,4,7,10;BYDAY=1MO" : "FREQ=MONTHLY;INTERVAL=3",
        startDate: firstMonday
          ? nthWeekday(date.with({ month: 1 + 3 * random(4) }), 1, 1)
          : date.with({ day: 1 + random(28) }),
        startMinute: businessMinute(),
        title: "Quarterly review",
      };
    }
    case "birthday":
      return {
        kind: "all-day",
        minutes: 0,
        rule: "FREQ=YEARLY",
        // One birthday on 29 February, which has no occurrence in 2026 or 2027.
        startDate: index === 0 ? Temporal.PlainDate.from("1988-02-29") : dateIn(random, 1950, 2005),
        startMinute: 0,
        title: "Birthday",
      };
    case "chore": {
      const floating = random(2) === 0;
      const startDate = start();
      return {
        kind: floating ? "floating" : "all-day",
        minutes: 60,
        rule: `FREQ=WEEKLY;BYDAY=${floating ? byDay(random, startDate, 1) : weekdays[startDate.dayOfWeek - 1]}`,
        startDate,
        startMinute: floating ? 18 * 60 : 0,
        stepDays: 7,
        title: floating ? "Gym" : "Bin day",
      };
    }
  }
}

/** A start in the series' kind: an instant in its zone, a date, or a wall time. */
function startAt(shape: SeriesShape, date: Temporal.PlainDate): RecurrenceDate {
  if (shape.kind === "all-day") return date;
  const wall = date.toPlainDateTime({
    hour: Math.floor(shape.startMinute / 60),
    minute: shape.startMinute % 60,
  });
  return shape.kind === "floating" ? wall : wall.toZonedDateTime(shape.timeZone!).toInstant();
}

function intervalAt(shape: SeriesShape, start: RecurrenceDate) {
  if (start instanceof Temporal.PlainDate) {
    return { end: start.add({ days: 1 }), kind: "all-day" as const, start };
  }
  if (start instanceof Temporal.PlainDateTime) {
    return { end: start.add({ minutes: shape.minutes }), kind: "floating" as const, start };
  }
  return {
    end: start.add({ minutes: shape.minutes }),
    kind: "timed" as const,
    sourceTimeZone: shape.timeZone!,
    start,
  };
}

/** The last moment of `date` in the series' kind, for UNTIL. */
function endOfDay(shape: SeriesShape, date: Temporal.PlainDate): RecurrenceDate {
  if (shape.kind === "all-day") return date;
  const wall = date.toPlainDateTime({ hour: 23, minute: 59, second: 59 });
  return shape.kind === "floating" ? wall : wall.toZonedDateTime(shape.timeZone!).toInstant();
}

/** A date in 2026 that is `startDate` plus a whole number of steps, so an occurrence's. */
function occurrenceIn2026(random: Random, shape: SeriesShape, stepDays: number) {
  const elapsed = Math.max(0, shape.startDate.until(firstOfYear).days);
  const first = shape.startDate.add({ days: Math.ceil(elapsed / stepDays) * stepDays });
  const steps = random(Math.floor(first.until(lastOfYear).days / stepDays) + 1);
  return first.add({ days: steps * stepDays });
}

function createSeries(
  ordinal: number,
  category: RecurrenceFixtureCategory,
  index: number,
  random: Random,
): readonly RecurrenceFixtureEvent[] {
  // A tenth end after a COUNT and start recently, and a tenth end on an UNTIL in 2026. The rest
  // go on, most since years before, so the engine skips ahead to the year. Birthdays go on.
  const draw = category === "birthday" ? 9 : random(10);
  const ending = draw === 0 ? "count" : draw === 1 ? "until" : "open";
  const shape = shapeOf(category, index, random, {
    firstYear: ending === "count" ? 2024 : 2015,
    lastYear: 2026,
  });
  const id = `series-${String(ordinal).padStart(3, "0")}`;
  const data = Object.freeze({ category, ordinal });

  let rule = parseRule(shape.rule);
  if (ending === "count") {
    rule = parseRule(`${shape.rule};COUNT=${pick(random, [10, 26, 52, 200])}`);
  } else if (ending === "until") {
    let until = firstOfYear.add({ days: 60 + random(270) });
    if (Temporal.PlainDate.compare(until, shape.startDate) <= 0) {
      until = shape.startDate.add({ months: 6 });
    }
    rule = { ...rule, until: endOfDay(shape, until) };
  }

  // Open series that repeat by a fixed step skip some days and move or cancel an occurrence.
  const exceptionDates: RecurrenceDate[] = [];
  const overrides: RecurrenceFixtureEvent[] = [];
  const { stepDays } = shape;
  if (ending === "open" && stepDays !== undefined) {
    if (random(10) < 3) {
      for (let count = 1 + random(3); count > 0; count -= 1) {
        exceptionDates.push(startAt(shape, occurrenceIn2026(random, shape, stepDays)));
      }
    }
    const movedDate = random(10) < 2 ? occurrenceIn2026(random, shape, stepDays) : undefined;
    if (movedDate !== undefined) {
      const recurrenceId = startAt(shape, movedDate);
      const moved =
        recurrenceId instanceof Temporal.PlainDate
          ? recurrenceId.add({ days: 1 })
          : recurrenceId.add({ hours: 1 });
      overrides.push(
        Object.freeze({
          data,
          id: `${id}-moved`,
          ...intervalAt(shape, moved),
          override: Object.freeze({ recurrenceId, seriesId: id }),
          title: `${shape.title} (moved)`,
        }),
      );
    }
    if (random(10) < 2) {
      let cancelledDate = occurrenceIn2026(random, shape, stepDays);
      if (movedDate?.equals(cancelledDate) === true) {
        cancelledDate = cancelledDate.add({ days: stepDays });
      }
      const recurrenceId = startAt(shape, cancelledDate);
      overrides.push(
        Object.freeze({
          data,
          id: `${id}-cancelled`,
          ...intervalAt(shape, recurrenceId),
          override: Object.freeze({ cancelled: true, recurrenceId, seriesId: id }),
          title: shape.title,
        }),
      );
    }
  }

  const master: RecurrenceFixtureEvent = Object.freeze({
    data,
    id,
    ...intervalAt(shape, startAt(shape, shape.startDate)),
    recurrence: Object.freeze({
      ...(exceptionDates.length === 0 ? {} : { exceptionDates: Object.freeze(exceptionDates) }),
      rule,
    }),
    title: shape.title,
  });
  return [master, ...overrides];
}

/**
 * A deterministic calendar of `seriesCount` recurring series (200 by default): daily stand-ups,
 * weekly and bi-weekly meetings, monthly ones by day and by weekday, quarterly reviews, birthdays
 * and chores, timed in five zones, all-day or floating. Some end after a COUNT or on an UNTIL,
 * some skip EXDATEs, and a few have an occurrence moved or cancelled by an override.
 */
export function generateRecurrenceFixture(
  options: RecurrenceFixtureOptions = {},
): RecurrenceFixture {
  const seed = options.seed ?? BENCHMARK_FIXTURE_SEED;
  const seriesCount = options.seriesCount ?? RECURRENCE_SERIES_COUNT;
  if (!Number.isSafeInteger(seed)) throw new RangeError("seed-must-be-a-safe-integer");
  if (!Number.isSafeInteger(seriesCount) || seriesCount < 1) {
    throw new RangeError("series-count-must-be-a-positive-integer");
  }

  const random = createRandom(seed);
  const indexes = new Map<RecurrenceFixtureCategory, number>();
  const events: RecurrenceFixtureEvent[] = [];
  for (let ordinal = 0; ordinal < seriesCount; ordinal += 1) {
    const category = cycle[ordinal % cycle.length]!;
    const index = indexes.get(category) ?? 0;
    indexes.set(category, index + 1);
    events.push(...createSeries(ordinal, category, index, random));
  }

  return Object.freeze({
    events: Object.freeze(events),
    nextYear: yearViewLoadRange(navigateYear(RECURRENCE_ANCHOR, 1), RECURRENCE_DISPLAY_TIME_ZONE),
    overrides: events.length - seriesCount,
    seed,
    series: seriesCount,
    year: yearViewLoadRange(RECURRENCE_ANCHOR, RECURRENCE_DISPLAY_TIME_ZONE),
  });
}
