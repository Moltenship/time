import type { CalendarEventInterval } from "@moltenship/calendar";
import { formatRecurrenceRule, type RecurrenceRule } from "@moltenship/calendar-recurrence";
import { describe, expect, test } from "vite-plus/test";

import {
  describeRule,
  presetLabel,
  readRule,
  repeatFromRule,
  repeatPresets,
  ruleFromRepeat,
  repeatChange,
  type RepeatDraft,
} from "../src/repeat";

const berlin = "Europe/Berlin";
// The second Tuesday of October 2026.
const tuesday = Temporal.PlainDate.from("2026-10-13");
const timed = {
  end: Temporal.Instant.from("2026-10-13T08:00:00Z"),
  kind: "timed",
  sourceTimeZone: berlin,
  start: Temporal.Instant.from("2026-10-13T07:30:00Z"),
} as const;
const allDay = { end: tuesday.add({ days: 1 }), kind: "all-day", start: tuesday } as const;

const never = { type: "never" } as const;
const text = (repeat: RepeatDraft, first: CalendarEventInterval = timed) => {
  const rule = ruleFromRepeat(repeat, first, berlin);
  return rule === undefined ? undefined : formatRecurrenceRule(rule);
};
const rule = (value: string): RecurrenceRule => {
  const parsed = readRule(value);
  if (parsed === undefined) throw new Error(`${value} is a rule`);
  return parsed;
};

describe("the Repeat field's presets", () => {
  test("name each preset after the start", () => {
    expect(repeatPresets.map((preset) => presetLabel(preset, tuesday, "en-US"))).toEqual([
      "Does not repeat",
      "Daily",
      "Every weekday (Monday to Friday)",
      "Weekly on Tuesday",
      "Monthly on the second Tuesday",
      "Monthly on day 13",
      "Annually on October 13",
    ]);
    // A fifth weekday is the month's last.
    expect(presetLabel("monthly-weekday", Temporal.PlainDate.from("2026-10-29"), "en-US")).toBe(
      "Monthly on the last Thursday",
    );
  });

  test("write the rule each preset means", () => {
    expect(text({ end: never, frequency: "none" })).toBeUndefined();
    expect(text({ end: never, frequency: "daily" })).toBe("FREQ=DAILY");
    expect(text({ end: never, frequency: "weekdays" })).toBe("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR");
    expect(text({ end: never, frequency: "weekly" })).toBe("FREQ=WEEKLY;BYDAY=TU");
    expect(text({ end: never, frequency: "monthly-weekday" })).toBe("FREQ=MONTHLY;BYDAY=2TU");
    // Days spelled out, so a series whose first start is on another day keeps them.
    expect(text({ end: never, frequency: "monthly-day" })).toBe("FREQ=MONTHLY;BYMONTHDAY=13");
    expect(text({ end: never, frequency: "yearly" })).toBe("FREQ=YEARLY;BYMONTHDAY=13;BYMONTH=10");
  });

  test("end after a number of times, or with a day in the series' own zone", () => {
    expect(text({ end: { count: 6, type: "count" }, frequency: "weekly" })).toBe(
      "FREQ=WEEKLY;COUNT=6;BYDAY=TU",
    );
    const until = { date: Temporal.PlainDate.from("2026-12-31"), type: "until" } as const;
    // The last moment of 31 December in Berlin, rounded down to the second.
    expect(text({ end: until, frequency: "daily" })).toBe("FREQ=DAILY;UNTIL=20261231T225959Z");
    expect(text({ end: until, frequency: "yearly" }, allDay)).toBe(
      "FREQ=YEARLY;UNTIL=20261231;BYMONTHDAY=13;BYMONTH=10",
    );
  });

  test("read a stored rule back as its preset, whichever way it's written", () => {
    const read = (value: string) => repeatFromRule(rule(value), tuesday, berlin);

    expect(read("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR").frequency).toBe("weekdays");
    expect(read("FREQ=WEEKLY").frequency).toBe("weekly");
    expect(read("FREQ=WEEKLY;BYDAY=TU;INTERVAL=1").frequency).toBe("weekly");
    expect(read("FREQ=MONTHLY;BYMONTHDAY=13").frequency).toBe("monthly-day");
    expect(read("FREQ=MONTHLY;BYDAY=2TU").frequency).toBe("monthly-weekday");
    expect(read("FREQ=YEARLY;BYMONTHDAY=13;BYMONTH=10").frequency).toBe("yearly");
    expect(read("FREQ=DAILY;COUNT=21")).toMatchObject({
      end: { count: 21, type: "count" },
      frequency: "daily",
    });
    expect(read("FREQ=DAILY;UNTIL=20261231T225959Z").end).toEqual({
      date: Temporal.PlainDate.from("2026-12-31"),
      type: "until",
    });
  });

  test("keep a rule no preset matches as custom, and write it back unchanged", () => {
    const moved = rule("FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH");
    const repeat = repeatFromRule(moved, tuesday, berlin);

    expect(repeat.frequency).toBe("custom");
    expect(text(repeat)).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH");
    expect(text({ ...repeat, end: { count: 4, type: "count" } })).toBe(
      "FREQ=WEEKLY;COUNT=4;INTERVAL=2;BYDAY=TU,TH",
    );
  });

  test("tell a new way to repeat from a new end, and moving from neither", () => {
    const weekly: RepeatDraft = { end: never, frequency: "weekly" };
    const change = (next: RepeatDraft, first = timed) => repeatChange(weekly, next, first, berlin);

    expect(change(weekly)).toEqual({});
    // Moved to Wednesday: the rule moves with the series, so nothing changed here.
    expect(change(weekly, { ...timed, start: timed.start.add({ hours: 24 }) })).toEqual({});
    expect(change({ ...weekly, frequency: "daily" })).toEqual({ rule: { frequency: "DAILY" } });
    expect(change({ ...weekly, end: { count: 4, type: "count" } })).toEqual({ end: { count: 4 } });
    expect(
      change({ ...weekly, end: { date: tuesday, type: "until" } }).end?.until?.toString(),
    ).toBe("2026-10-13T21:59:59.999999999Z");
    expect(change({ end: never, frequency: "none" })).toEqual({ rule: null });
    expect(
      repeatChange(weekly, { ...weekly, end: { count: 4, type: "count" } }, timed, berlin),
    ).not.toHaveProperty("rule");
  });
});

describe("rules in words", () => {
  const words = (value: string, start = tuesday) =>
    describeRule(rule(value), start, berlin, "en-US");

  test("say how a series repeats and when it stops", () => {
    expect(words("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR")).toBe("Every weekday");
    expect(words("FREQ=WEEKLY;BYDAY=TU,WE,TH,FR,SA")).toBe(
      "Weekly on Tuesday, Wednesday, Thursday, Friday, and Saturday",
    );
    expect(words("FREQ=WEEKLY;INTERVAL=2")).toBe("Every 2 weeks on Tuesday");
    expect(words("FREQ=MONTHLY;BYDAY=2TU")).toBe("Monthly on the second Tuesday");
    expect(words("FREQ=MONTHLY;BYDAY=-1FR")).toBe("Monthly on the last Friday");
    expect(words("FREQ=YEARLY", Temporal.PlainDate.from("2024-02-29"))).toBe(
      "Annually on February 29",
    );
    expect(words("FREQ=DAILY;COUNT=1")).toBe("Daily, 1 time");
    expect(words("FREQ=DAILY;COUNT=21")).toBe("Daily, 21 times");
    expect(words("FREQ=DAILY;UNTIL=20261231T225959Z")).toBe("Daily, until December 31, 2026");
  });

  test("fall back to the RRULE for rules the words don't cover", () => {
    expect(words("FREQ=MONTHLY;BYDAY=MO,TU;BYSETPOS=-1")).toBe(
      "Repeats FREQ=MONTHLY;BYDAY=MO,TU;BYSETPOS=-1",
    );
    expect(words("FREQ=HOURLY;INTERVAL=4")).toBe("Repeats FREQ=HOURLY;INTERVAL=4");
  });
});
