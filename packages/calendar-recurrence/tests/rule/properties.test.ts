import { describe, expect, test } from "vite-plus/test";

import {
  expandRecurrenceRule,
  type RecurrenceDate,
  type RecurrenceRule,
  type RecurrenceRuleStart,
  type RecurrenceRuleWindow,
} from "../../src";

// Properties every expansion keeps, over seeded random rules, starts and windows, with timed starts
// and window bounds placed around DST transitions. Then a regression test per bug they found.

type Kind = RecurrenceRuleStart["kind"];
type Weekday = "FR" | "MO" | "SA" | "SU" | "TH" | "TU" | "WE";

const WEEKDAYS: readonly Weekday[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const ZONES = [
  "Europe/Berlin",
  "America/New_York",
  "Australia/Lord_Howe",
  "America/Santiago",
  "America/Havana",
  "America/Nuuk",
  "Pacific/Apia",
  "Asia/Kolkata",
  "UTC",
];

/** mulberry32: a small seeded generator, so a failure names the seed that reproduces it. */
function random(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const chance = (p: number) => next() < p;
  const pick = <T>(values: readonly T[]): T => values[int(0, values.length - 1)]!;
  const some = (make: () => number, max: number) => [
    ...new Set(Array.from({ length: int(1, max) }, make)),
  ];
  return { chance, int, pick, some };
}

type Random = ReturnType<typeof random>;

const FREQUENCIES = [
  "YEARLY",
  "MONTHLY",
  "WEEKLY",
  "DAILY",
  "HOURLY",
  "MINUTELY",
  "SECONDLY",
] as const;

/** How far past the start a window reaches for each FREQ, in seconds. */
const SPAN: Record<(typeof FREQUENCIES)[number], number> = {
  DAILY: 120 * 86_400,
  HOURLY: 4 * 86_400,
  MINUTELY: 12 * 3600,
  MONTHLY: 4 * 365 * 86_400,
  SECONDLY: 1800,
  WEEKLY: 365 * 86_400,
  YEARLY: 30 * 365 * 86_400,
};

function randomRule(r: Random, kind: Kind): RecurrenceRule {
  const frequency = r.pick(kind === "all-day" ? FREQUENCIES.slice(0, 4) : FREQUENCIES);
  const subDaily = frequency === "HOURLY" || frequency === "MINUTELY" || frequency === "SECONDLY";
  const ordinals = frequency === "YEARLY" ? 53 : frequency === "MONTHLY" ? 5 : 0;
  const signed = (max: number) => (r.chance(0.3) ? -r.int(1, max) : r.int(1, max));
  return {
    frequency,
    ...(r.chance(0.5) && { interval: r.chance(0.8) ? r.int(2, 4) : r.int(5, 30) }),
    ...(r.chance(subDaily ? 0.1 : 0.3) && { byMonth: r.some(() => r.int(1, 12), 4) }),
    ...(r.chance(subDaily ? 0.1 : 0.3) && { byMonthDay: r.some(() => signed(31), 3) }),
    ...(r.chance(frequency === "YEARLY" ? 0.25 : 0.05) && {
      byYearDay: r.some(() => (r.chance(0.3) ? r.int(360, 366) : signed(366)), 3),
    }),
    ...(r.chance(frequency === "YEARLY" ? 0.25 : 0.05) && {
      byWeekNumber: r.some(
        () => (r.chance(0.4) ? r.pick([1, 52, 53, -1, -52, -53]) : signed(53)),
        3,
      ),
    }),
    ...(r.chance(subDaily ? 0.15 : 0.45) && {
      byDay: [r.pick(WEEKDAYS), ...WEEKDAYS.filter(() => r.chance(0.25))].map((weekday) =>
        ordinals > 0 && r.chance(0.4)
          ? { ordinal: r.chance(0.8) ? signed(Math.min(ordinals, 5)) : signed(ordinals), weekday }
          : { weekday },
      ),
    }),
    ...(kind !== "all-day" &&
      r.chance(0.3) && {
        byHour: r.some(() => (r.chance(0.5) ? r.pick([0, 1, 2, 3, 23]) : r.int(0, 23)), 3),
      }),
    ...(kind !== "all-day" &&
      r.chance(frequency === "SECONDLY" ? 0.5 : 0.25) && {
        byMinute: r.some(() => (r.chance(0.5) ? r.pick([0, 15, 30, 59]) : r.int(0, 59)), 3),
      }),
    ...(kind !== "all-day" &&
      r.chance(frequency === "SECONDLY" ? 0.4 : 0.1) && {
        bySecond: r.some(() => r.int(0, 59), 3),
      }),
    ...(r.chance(0.2) && { bySetPosition: r.some(() => signed(4), 2) }),
    ...(r.chance(0.25) && { weekStart: r.pick(WEEKDAYS) }),
  };
}

/** The offset transitions of a zone in the year after `from`. */
function transitionsAfter(timeZone: string, from: Temporal.Instant): Temporal.Instant[] {
  const found: Temporal.Instant[] = [];
  let zoned = from.toZonedDateTimeISO(timeZone);
  for (let index = 0; index < 4; index += 1) {
    const next = zoned.getTimeZoneTransition("next");
    if (next === null) break;
    found.push(next.toInstant());
    zoned = next;
  }
  return found;
}

interface Case {
  readonly first: RecurrenceRuleStart;
  readonly label: string;
  readonly rule: RecurrenceRule;
  readonly window: { readonly before: RecurrenceDate; readonly from: RecurrenceDate };
}

/** A start, often on or near a DST transition, and window bounds near transitions and period starts. */
function randomCase(seed: number): Case {
  const r = random(seed);
  const kind = r.pick<Kind>(["timed", "timed", "timed", "all-day", "floating"]);
  const rule = randomRule(r, kind);
  const span = SPAN[rule.frequency] * Math.min(rule.interval ?? 1, 3);
  const year = r.chance(0.1) ? r.int(1890, 1969) : r.int(2010, 2030);

  if (kind !== "timed") {
    const date = Temporal.PlainDate.from({
      day: r.pick([1, 15, 28, 29, 30, 31]),
      month: r.int(1, 12),
      year,
    });
    const wall = date.toPlainDateTime({
      hour: r.int(0, 23),
      minute: r.pick([0, 30, r.int(0, 59)]),
    });
    const bound = () => {
      let at = wall.add({ seconds: r.int(0, span) });
      if (r.chance(0.4))
        at = r
          .pick([at.with({ day: 1 }), at.with({ day: 1, month: 1 })])
          .with({ hour: 0, minute: 0 });
      return kind === "all-day" ? at.toPlainDate() : at;
    };
    const first: RecurrenceRuleStart =
      kind === "all-day"
        ? { end: date.add({ days: 1 }), kind, start: date }
        : { end: wall.add({ hours: 1 }), kind, start: wall };
    const [from, before] = [bound(), bound()].sort(compare);
    return { first, label: `seed ${seed}`, rule, window: { before: before!, from: from! } };
  }

  const timeZone = r.pick(ZONES);
  const near = Temporal.PlainDate.from({ day: 1, month: r.int(1, 12), year }).toZonedDateTime(
    timeZone,
  );
  const changes = transitionsAfter(timeZone, near.toInstant());
  let wall = near.toPlainDateTime().add({ hours: r.int(0, 24 * 30) });
  if (changes.length > 0 && r.chance(0.8)) {
    wall = r
      .pick(changes)
      .toZonedDateTimeISO(timeZone)
      .toPlainDateTime()
      .add({ minutes: r.chance(0.3) ? r.int(-3, 3) * 1440 : r.int(-150, 150) })
      .round({ roundingIncrement: r.pick([1, 15, 30]), smallestUnit: "minute" });
  }
  const zoned = wall.toZonedDateTime(timeZone, {
    disambiguation: r.chance(0.3) ? "later" : "compatible",
  });
  const start = zoned.toInstant();
  const inGap = !zoned.toPlainDateTime().equals(wall);
  const first: RecurrenceRuleStart = {
    end: start.add({ hours: 1 }),
    kind,
    sourceTimeZone: timeZone,
    start,
    ...(inGap && r.chance(0.6) && { wallStart: wall }),
  };
  const later = transitionsAfter(timeZone, start.subtract({ hours: 3 })).filter(
    (change) => Temporal.Instant.compare(change, start.add({ seconds: span * 2 })) < 0,
  );
  const bound = () => {
    if (later.length > 0 && r.chance(0.45)) {
      // Next to a transition, but not on it: bounds exactly on one are the regressions below.
      return r.pick(later).add({ seconds: r.pick([-3601, -3600, -1800, -1, 1, 1800, 3600, 5400]) });
    }
    const at = start.add({ seconds: r.int(0, span) });
    return r.chance(0.4) ? at.toZonedDateTimeISO(timeZone).startOfDay().toInstant() : at;
  };
  const [from, before] = [bound(), bound()].sort(compare);
  return { first, label: `seed ${seed}`, rule, window: { before: before!, from: from! } };
}

function compare(left: RecurrenceDate, right: RecurrenceDate): number {
  if (left instanceof Temporal.Instant)
    return Temporal.Instant.compare(left, right as Temporal.Instant);
  if (left instanceof Temporal.PlainDate)
    return Temporal.PlainDate.compare(left, right as Temporal.PlainDate);
  return Temporal.PlainDateTime.compare(left, right as Temporal.PlainDateTime);
}

const text = (dates: readonly RecurrenceDate[]) => dates.map(String);

const expand = (rule: RecurrenceRule, first: RecurrenceRuleStart, window?: RecurrenceRuleWindow) =>
  expandRecurrenceRule(rule, first, { maxIterations: 1_000_000, ...window });

/** Steps for expansions without a window, which rules that rarely match spend in full. */
const OPEN_STEPS = 500;

const CASES = Array.from({ length: 160 }, (_, index) => randomCase(48_000 + index));

/** Each case's expansion without a window, shared by the tests that compare against it. */
const opened = new Map<Case, ReturnType<typeof expand>>();
const open = (c: Case) => {
  let expansion = opened.get(c);
  if (expansion === undefined) {
    expansion = expand(c.rule, c.first, { maxIterations: OPEN_STEPS });
    opened.set(c, expansion);
  }
  return expansion;
};

describe("properties", () => {
  test("a window gives the dates the whole series has inside it", () => {
    let windowsWithDates = 0;
    for (const { first, label, rule, window } of CASES) {
      const whole = expand(rule, first, { before: window.before });
      const windowed = expand(rule, first, window);
      if (windowed.dates.length > 1) windowsWithDates += 1;
      expect(whole.truncated, label).toBe(false);
      expect(windowed.truncated, label).toBe(false);
      expect(text(windowed.dates), label).toEqual(
        text(whole.dates.filter((date) => compare(date, window.from) >= 0)),
      );
    }
    // Not vacuous: most windows hold dates.
    expect(windowsWithDates).toBeGreaterThan(CASES.length / 3);
  });

  test("`before` alone gives a prefix of the series without a window", () => {
    for (const c of CASES) {
      const { first, label, rule, window } = c;
      const bounded = expand(rule, first, { before: window.before });
      const { dates, truncated } = open(c);
      const last = dates.at(-1);
      if (truncated && (last === undefined || compare(last, window.before) < 0)) continue;
      expect(text(bounded.dates), label).toEqual(
        text(dates.filter((date) => compare(date, window.before) < 0)),
      );
    }
  });

  test("dates are strictly increasing, of the first start's kind and ISO calendar, first start first", () => {
    for (const { first, label, rule, window } of CASES) {
      const { dates } = expand(rule, first, { before: window.before });
      const type = {
        "all-day": Temporal.PlainDate,
        floating: Temporal.PlainDateTime,
        timed: Temporal.Instant,
      }[first.kind];
      for (const date of dates) {
        expect(date, label).toBeInstanceOf(type);
        if (!(date instanceof Temporal.Instant)) expect(date.calendarId, label).toBe("iso8601");
      }
      for (let index = 1; index < dates.length; index += 1) {
        expect(compare(dates[index - 1]!, dates[index]!), label).toBeLessThan(0);
      }
      if (dates.length > 0) expect(String(dates[0]), label).toBe(String(first.start));
    }
  });

  test("COUNT takes the series' first dates, and a larger COUNT extends them", () => {
    for (const [index, c] of CASES.entries()) {
      const { first, label, rule } = c;
      const count = 1 + (index % 25);
      const whole = open(c);
      const counted = expand({ ...rule, count }, first, { maxIterations: OPEN_STEPS });
      const more = expand({ ...rule, count: count + 7 }, first, { maxIterations: OPEN_STEPS });
      if (!counted.truncated && !more.truncated) {
        expect(text(more.dates.slice(0, counted.dates.length)), label).toEqual(text(counted.dates));
      }
      if (!counted.truncated && (!whole.truncated || whole.dates.length >= count)) {
        expect(text(counted.dates), label).toEqual(text(whole.dates.slice(0, count)));
      }
    }
  });
});

// Confirmed bugs. Each test states the expected behaviour and FAILS until the bug is fixed.

/** A timed start at a wall time in `timeZone`. */
function timed(wall: string, timeZone: string): RecurrenceRuleStart {
  const start = Temporal.PlainDateTime.from(wall).toZonedDateTime(timeZone).toInstant();
  return { end: start.add({ hours: 1 }), kind: "timed", sourceTimeZone: timeZone, start };
}

const local = (dates: readonly RecurrenceDate[], timeZone: string) =>
  dates.map((date) =>
    (date as Temporal.Instant).toZonedDateTimeISO(timeZone).toString({ timeZoneName: "never" }),
  );

const midnight = (date: string, timeZone: string) =>
  Temporal.PlainDate.from(date).toZonedDateTime(timeZone).toInstant();

describe("regressions", () => {
  // Bounds exactly on a transition instant: the wall-time bounds must widen by that change too.

  test("an UNTIL exactly on a fall-back instant keeps the first pass of the repeated hour", () => {
    // 2026-10-25T01:00Z is when Berlin goes from +02:00 to +01:00; 02:10..02:50 +02:00 are before it.
    const { dates } = expand(
      { frequency: "MINUTELY", interval: 10, until: Temporal.Instant.from("2026-10-25T01:00:00Z") },
      timed("2026-10-25T01:00", "Europe/Berlin"),
    );
    expect(local(dates, "Europe/Berlin").at(-1)).toBe("2026-10-25T02:50:00+02:00");
    expect(dates).toHaveLength(12);
  });

  test("`before` exactly on a fall-back instant keeps the dates before it", () => {
    // Midnight in Regina (-06:00, no DST) is New York's fall-back instant, 2026-11-01T06:00Z.
    const { dates } = expand(
      { byMinute: [15, 45], frequency: "DAILY" },
      timed("2026-10-01T01:15", "America/New_York"),
      {
        before: midnight("2026-11-01", "America/Regina"),
        from: midnight("2026-10-31", "America/Regina"),
      },
    );
    expect(local(dates, "America/New_York")).toEqual([
      "2026-11-01T01:15:00-04:00",
      "2026-11-01T01:45:00-04:00",
    ]);
  });

  test("`from` exactly on a spring-forward instant keeps times the gap moved into the window", () => {
    // Nuuk skips 23:00..24:00 on Saturday 30 March 2024, so Sunday starts at the transition and
    // Saturday's 23:30 happens at 00:30 on Sunday.
    const { dates } = expand({ frequency: "DAILY" }, timed("2024-03-01T23:30", "America/Nuuk"), {
      before: midnight("2024-04-01", "America/Nuuk"),
      from: midnight("2024-03-31", "America/Nuuk"),
    });
    expect(local(dates, "America/Nuuk")).toEqual([
      "2024-03-31T00:30:00-01:00",
      "2024-03-31T23:30:00-01:00",
    ]);
  });

  test("window bounds exactly on any transition agree with the whole series", () => {
    const rules: RecurrenceRule[] = [
      { frequency: "DAILY" },
      { byHour: [0, 1, 2, 3, 23], byMinute: [0, 30], frequency: "DAILY" },
      { frequency: "HOURLY", interval: 2 },
      { byMinute: [10, 40], frequency: "HOURLY", interval: 5 },
      { frequency: "MINUTELY", interval: 7 },
    ];
    const failures: string[] = [];
    for (const timeZone of ZONES) {
      for (const change of transitionsAfter(
        timeZone,
        Temporal.Instant.from("2024-01-01T00:00:00Z"),
      )) {
        const start = change
          .subtract({ hours: 27 })
          .round({ roundingMode: "floor", smallestUnit: "hour" });
        const first: RecurrenceRuleStart = {
          end: start,
          kind: "timed",
          sourceTimeZone: timeZone,
          start,
        };
        const end = change.add({ hours: 6 });
        for (const rule of rules) {
          const whole = expand(rule, first, { before: end }).dates;
          for (const window of [
            { before: change, from: start },
            { before: end, from: change },
          ]) {
            const want = whole.filter(
              (date) => compare(date, window.from) >= 0 && compare(date, window.before) < 0,
            );
            if (text(expand(rule, first, window).dates).join() !== text(want).join()) {
              failures.push(
                `${timeZone} ${change.toString()} ${JSON.stringify(rule)} ${JSON.stringify(window)}`,
              );
            }
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  test("a timed series doesn't report truncation when the cap runs out exactly at `before`", () => {
    // Steps: 1 January (the first start), then 2..5 January give nothing; 6 January is `before`.
    // The all-day series in expand-rule-contract.test.ts gives `truncated: false` here.
    const expansion = expandRecurrenceRule(
      { byMonthDay: [1], frequency: "DAILY" },
      timed("2026-01-01T00:00", "UTC"),
      { before: Temporal.Instant.from("2026-01-06T00:00:00Z"), maxIterations: 5 },
    );
    expect(expansion.truncated).toBe(false);
  });
});
