import { describe, expect, test } from "vite-plus/test";

import type { RecurrenceRule } from "../../src";
import { shiftRule, type RuleShift } from "../../src/edits/rule-shift";
import "./harness";

// Rules the baseline engine can't expand yet move here on the rule objects alone.

const nine = Temporal.PlainDateTime.from("2026-10-13T09:00");

function shift(days: number, time = "PT0S", before = nine, toAllDay = false): RuleShift {
  const duration = Temporal.Duration.from(time);
  return {
    days,
    firstAfter: before.add({ days }).add(duration),
    firstBefore: before,
    time: duration,
    toAllDay,
  };
}

const moved = (rule: RecurrenceRule, by: RuleShift) => shiftRule(rule, by);

describe("shiftRule", () => {
  test("moves weekdays by the day delta, wrapping the week", () => {
    expect(
      moved({ byDay: [{ weekday: "SA" }, { weekday: "SU" }], frequency: "WEEKLY" }, shift(2)),
    ).toEqual({
      rule: { byDay: [{ weekday: "MO" }, { weekday: "TU" }], frequency: "WEEKLY" },
    });
    expect(moved({ byDay: [{ weekday: "MO" }], frequency: "DAILY" }, shift(-1))).toEqual({
      rule: { byDay: [{ weekday: "SU" }], frequency: "DAILY" },
    });
  });

  test("keeps an ordinal for a move of days, and moves it by whole weeks", () => {
    const second: RecurrenceRule = { byDay: [{ ordinal: 2, weekday: "TU" }], frequency: "MONTHLY" };
    expect(moved(second, shift(1))).toEqual({
      rule: { byDay: [{ ordinal: 2, weekday: "WE" }], frequency: "MONTHLY" },
    });
    expect(moved(second, shift(-3))).toEqual({
      rule: { byDay: [{ ordinal: 2, weekday: "SA" }], frequency: "MONTHLY" },
    });
    expect(moved(second, shift(7))).toEqual({
      rule: { byDay: [{ ordinal: 3, weekday: "TU" }], frequency: "MONTHLY" },
    });
    expect(moved(second, shift(6))).toEqual({
      rule: { byDay: [{ ordinal: 3, weekday: "MO" }], frequency: "MONTHLY" },
    });
    expect(
      moved({ byDay: [{ ordinal: -1, weekday: "TU" }], frequency: "MONTHLY" }, shift(-7)),
    ).toEqual({ rule: { byDay: [{ ordinal: -2, weekday: "TU" }], frequency: "MONTHLY" } });
  });

  test("an ordinal that would leave the month can't move", () => {
    expect(
      moved({ byDay: [{ ordinal: -1, weekday: "TU" }], frequency: "MONTHLY" }, shift(7)),
    ).toHaveProperty("problem");
    expect(
      moved({ byDay: [{ ordinal: 5, weekday: "TU" }], frequency: "MONTHLY" }, shift(7)),
    ).toHaveProperty("problem");
    // A yearly ordinal counts weeks of the year.
    expect(
      moved({ byDay: [{ ordinal: 20, weekday: "MO" }], frequency: "YEARLY" }, shift(7)),
    ).toEqual({ rule: { byDay: [{ ordinal: 21, weekday: "MO" }], frequency: "YEARLY" } });
  });

  test("month and year days move by the day delta, within their range", () => {
    expect(moved({ byMonthDay: [1, 15], frequency: "MONTHLY" }, shift(1))).toEqual({
      rule: { byMonthDay: [2, 16], frequency: "MONTHLY" },
    });
    expect(moved({ byMonthDay: [-1], frequency: "MONTHLY" }, shift(-1))).toEqual({
      rule: { byMonthDay: [-2], frequency: "MONTHLY" },
    });
    expect(moved({ byMonthDay: [-1], frequency: "MONTHLY" }, shift(1))).toHaveProperty("problem");
    expect(moved({ byMonthDay: [31], frequency: "MONTHLY" }, shift(1))).toHaveProperty("problem");
    expect(moved({ byYearDay: [100], frequency: "YEARLY" }, shift(-3))).toEqual({
      rule: { byYearDay: [97], frequency: "YEARLY" },
    });
    // Tuesday the 13th a day later is Wednesday the 14th.
    expect(
      moved({ byDay: [{ weekday: "TU" }], byMonthDay: [13], frequency: "MONTHLY" }, shift(1)),
    ).toEqual({ rule: { byDay: [{ weekday: "WE" }], byMonthDay: [14], frequency: "MONTHLY" } });
  });

  test("BYMONTH follows the first occurrence in yearly rules, and filters in daily ones", () => {
    const october31 = Temporal.PlainDateTime.from("2026-10-31T09:00");
    expect(moved({ byMonth: [10], frequency: "YEARLY" }, shift(1, "PT0S", october31))).toEqual({
      rule: { byMonth: [11], frequency: "YEARLY" },
    });
    expect(
      moved(
        { byMonth: [12], frequency: "YEARLY" },
        shift(31, "PT0S", Temporal.PlainDateTime.from("2026-12-15T09:00")),
      ),
    ).toEqual({
      rule: { byMonth: [1], frequency: "YEARLY" },
    });
    expect(moved({ byMonth: [10], frequency: "DAILY" }, shift(1, "PT0S", october31))).toEqual({
      rule: { byMonth: [10], frequency: "DAILY" },
    });
    // Ordinal weekdays count within their month, which stays.
    expect(
      moved(
        { byDay: [{ ordinal: -1, weekday: "SA" }], byMonth: [10], frequency: "YEARLY" },
        shift(1, "PT0S", october31),
      ),
    ).toEqual({
      rule: { byDay: [{ ordinal: -1, weekday: "SU" }], byMonth: [10], frequency: "YEARLY" },
    });
  });

  test("moves WKST with BYDAY when INTERVAL groups several days into weeks", () => {
    const rule: RecurrenceRule = {
      byDay: [{ weekday: "MO" }, { weekday: "SU" }],
      frequency: "WEEKLY",
      interval: 2,
    };
    expect(moved(rule, shift(1))).toEqual({
      rule: { ...rule, byDay: [{ weekday: "TU" }, { weekday: "MO" }], weekStart: "TU" },
    });
    expect(moved({ ...rule, interval: 1 }, shift(1))).toEqual({
      rule: { ...rule, byDay: [{ weekday: "TU" }, { weekday: "MO" }], interval: 1 },
    });
  });

  test("BYSETPOS and BYWEEKNO can't move to another day, only to another time", () => {
    const setPosition: RecurrenceRule = {
      byDay: [{ weekday: "MO" }, { weekday: "FR" }],
      bySetPosition: [-1],
      frequency: "MONTHLY",
    };
    expect(moved(setPosition, shift(1))).toHaveProperty("problem");
    expect(moved({ byWeekNumber: [20], frequency: "YEARLY" }, shift(-1))).toHaveProperty("problem");
    expect(moved(setPosition, shift(0, "PT1H"))).toEqual({ rule: setPosition });
  });

  test("moves BYHOUR and BYMINUTE by the time delta", () => {
    expect(moved({ byHour: [9, 17], frequency: "DAILY" }, shift(0, "PT1H"))).toEqual({
      rule: { byHour: [10, 18], frequency: "DAILY" },
    });
    expect(
      moved({ byHour: [9], byMinute: [0, 30], frequency: "DAILY" }, shift(0, "PT15M")),
    ).toEqual({ rule: { byHour: [9], byMinute: [15, 45], frequency: "DAILY" } });
    // 09:00 and 09:30 moved by 45 minutes are 09:45 and 10:15: no longer a grid.
    expect(
      moved({ byHour: [9], byMinute: [0, 30], frequency: "DAILY" }, shift(0, "PT45M")),
    ).toHaveProperty("problem");
    expect(moved({ byHour: [9, 23], frequency: "DAILY" }, shift(0, "PT2H"))).toHaveProperty(
      "problem",
    );
  });

  test("drops one time of day when the series becomes all-day, and refuses several", () => {
    expect(moved({ byHour: [9], frequency: "DAILY" }, shift(0, "PT0S", nine, true))).toEqual({
      rule: { frequency: "DAILY" },
    });
    expect(
      moved({ byHour: [9, 17], frequency: "DAILY" }, shift(0, "PT0S", nine, true)),
    ).toHaveProperty("problem");
  });

  test("leaves the input alone", () => {
    const rule: RecurrenceRule = { byDay: [{ weekday: "MO" }], frequency: "WEEKLY" };
    const copy = structuredClone(rule);
    moved(rule, shift(3));
    expect(rule).toEqual(copy);
  });
});
