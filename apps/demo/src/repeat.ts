import type { CalendarEventInterval } from "@moltenship/calendar";
import {
  coerceRecurrenceDate,
  formatRecurrenceRule,
  parseRecurrenceRule,
  type RecurrenceRule,
} from "@moltenship/calendar-recurrence";

type Weekday = NonNullable<RecurrenceRule["byDay"]>[number]["weekday"];

/** ISO weekday numbers, Monday 1 to Sunday 7, as RRULE writes them. */
const weekdays: readonly Weekday[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const workweek = weekdays.slice(0, 5);
const ordinals = ["first", "second", "third", "fourth"] as const;

/** The editor's presets, named after the event's start, as calendar apps offer them. */
export type RepeatFrequency =
  | "none"
  | "daily"
  | "weekdays"
  | "weekly"
  | "monthly-weekday"
  | "monthly-day"
  | "yearly"
  /** A rule no preset matches, such as one a series edit moved; kept as it is. */
  | "custom";

export type RepeatEnd =
  | { readonly type: "never" }
  | { readonly date: Temporal.PlainDate; readonly type: "until" }
  | { readonly count: number; readonly type: "count" };

export interface RepeatDraft {
  readonly end: RepeatEnd;
  readonly frequency: RepeatFrequency;
  /** The series' rule, which `"custom"` keeps. */
  readonly rule?: RecurrenceRule;
}

export const noRepeat: RepeatDraft = { end: { type: "never" }, frequency: "none" };

const weekdayOf = (date: Temporal.PlainDate): Weekday => weekdays[date.dayOfWeek - 1]!;

/** Which of its weekday in the month a date is: 1 to 4, or -1 for a fifth, which is the last. */
function weekdayOrdinal(date: Temporal.PlainDate): number {
  const nth = Math.ceil(date.day / 7);
  return nth <= 4 ? nth : -1;
}

/** The rule a preset means for a series starting on `start`, without an end. */
function presetRule(
  frequency: Exclude<RepeatFrequency, "none" | "custom">,
  start: Temporal.PlainDate,
): RecurrenceRule {
  switch (frequency) {
    case "daily":
      return { frequency: "DAILY" };
    case "weekdays":
      return { byDay: workweek.map((weekday) => ({ weekday })), frequency: "WEEKLY" };
    case "weekly":
      return { byDay: [{ weekday: weekdayOf(start) }], frequency: "WEEKLY" };
    case "monthly-weekday":
      return {
        byDay: [{ ordinal: weekdayOrdinal(start), weekday: weekdayOf(start) }],
        frequency: "MONTHLY",
      };
    case "monthly-day":
      return { frequency: "MONTHLY" };
    case "yearly":
      return { frequency: "YEARLY" };
  }
}

/** The same rule written another way: what the start already says, spelled out. */
function presetAlternatives(
  frequency: Exclude<RepeatFrequency, "none" | "custom">,
  start: Temporal.PlainDate,
): readonly RecurrenceRule[] {
  switch (frequency) {
    case "weekly":
      return [{ frequency: "WEEKLY" }];
    case "monthly-day":
      return [{ byMonthDay: [start.day], frequency: "MONTHLY" }];
    case "yearly":
      return [{ byMonth: [start.month], byMonthDay: [start.day], frequency: "YEARLY" }];
    default:
      return [];
  }
}

const presets = [
  "daily",
  "weekdays",
  "weekly",
  "monthly-weekday",
  "monthly-day",
  "yearly",
] as const satisfies readonly RepeatFrequency[];

/** A rule's text without its end, and without parts that only restate RFC 5545's defaults. */
function shapeOf(rule: RecurrenceRule): string {
  const { count: _count, interval, until: _until, weekStart, ...rest } = rule;
  return formatRecurrenceRule({
    ...rest,
    // WKST only changes weekly rules that skip weeks; one written on a plain rule says nothing.
    ...(interval === undefined || interval === 1 ? {} : { interval, weekStart }),
  });
}

/** Where a series' rule ends, as the editor shows it, on the series' own dates. */
function endOf(rule: RecurrenceRule, timeZone: string): RepeatEnd {
  if (rule.count !== undefined) return { count: rule.count, type: "count" };
  const { until } = rule;
  if (until === undefined) return { type: "never" };
  const date =
    until instanceof Temporal.Instant
      ? until.toZonedDateTimeISO(timeZone).toPlainDate()
      : until instanceof Temporal.PlainDateTime
        ? until.toPlainDate()
        : until;
  return { date, type: "until" };
}

/**
 * The editor's view of a series' rule: the preset it matches for a series starting on `start`, or
 * `"custom"`. `timeZone` is the series' zone, which a timed series' UNTIL is read in.
 */
export function repeatFromRule(
  rule: RecurrenceRule | undefined,
  start: Temporal.PlainDate,
  timeZone: string,
): RepeatDraft {
  if (rule === undefined) return noRepeat;
  const shape = shapeOf(rule);
  const frequency =
    presets.find((preset) =>
      [presetRule(preset, start), ...presetAlternatives(preset, start)].some(
        (candidate) => shapeOf(candidate) === shape,
      ),
    ) ?? "custom";
  return { end: endOf(rule, timeZone), frequency, rule };
}

/**
 * The rule a draft asks for, for a series whose first occurrence is `first`: its preset on the
 * start's weekday and date, or the kept custom rule, ending as `end` says. An end date on a timed
 * series ends with that day in `timeZone`, the zone it repeats in.
 */
export function ruleFromRepeat(
  repeat: RepeatDraft,
  first: CalendarEventInterval,
  timeZone: string,
): RecurrenceRule | undefined {
  const { frequency } = repeat;
  if (frequency === "none") return undefined;
  const start = startDate(first, timeZone);
  const base =
    frequency === "custom"
      ? withoutEnd(repeat.rule ?? { frequency: "DAILY" })
      : presetRule(frequency, start);
  const { end } = repeat;
  if (end.type === "count") return { ...base, count: end.count };
  if (end.type === "never") return base;
  const until = coerceRecurrenceDate(end.date, first, "until", { defaultTimeZone: timeZone });
  return until === undefined ? base : { ...base, until };
}

/** The rule without COUNT or UNTIL: how it repeats, not when it stops. */
export function withoutEnd(rule: RecurrenceRule): RecurrenceRule {
  const { count: _count, until: _until, ...rest } = rule;
  return rest;
}

function startDate(interval: CalendarEventInterval, timeZone: string): Temporal.PlainDate {
  switch (interval.kind) {
    case "all-day":
      return interval.start;
    case "floating":
      return interval.start.toPlainDate();
    case "timed":
      return interval.start.toZonedDateTimeISO(timeZone).toPlainDate();
  }
}

/** Whether two drafts ask for the same rule, so saving the second changes nothing. */
export function sameRepeat(left: RepeatDraft, right: RepeatDraft): boolean {
  if (left.frequency !== right.frequency) return false;
  if (left.frequency === "none") return true;
  const { end } = left;
  const other = right.end;
  if (end.type !== other.type) return false;
  if (end.type === "count") return other.type === "count" && end.count === other.count;
  if (end.type === "until") return other.type === "until" && end.date.equals(other.date);
  return true;
}

// Descriptions, in English like the rest of the demo, with dates in the calendar's locale.

function weekdayName(weekday: Weekday, locale: Intl.LocalesArgument): string {
  // 2024-01-01 was a Monday.
  const date = Temporal.PlainDate.from("2024-01-01").add({ days: weekdays.indexOf(weekday) });
  return date.toLocaleString(locale, { weekday: "long" });
}

function ordinalName(ordinal: number): string | undefined {
  return ordinal === -1 ? "last" : ordinals[ordinal - 1];
}

function list(items: readonly string[], locale: Intl.LocalesArgument): string {
  return new Intl.ListFormat(locale as string | undefined, { type: "conjunction" }).format(items);
}

function every(interval: number | undefined, one: string, unit: string): string {
  return interval === undefined || interval === 1 ? one : `Every ${interval} ${unit}`;
}

function describeShape(
  rule: RecurrenceRule,
  start: Temporal.PlainDate,
  locale: Intl.LocalesArgument,
): string | undefined {
  const { byDay, byMonth, byMonthDay, frequency, interval } = rule;
  const others =
    rule.byHour ??
    rule.byMinute ??
    rule.bySecond ??
    rule.bySetPosition ??
    rule.byWeekNumber ??
    rule.byYearDay;
  if (others !== undefined) return undefined;

  switch (frequency) {
    case "DAILY":
      return byDay === undefined && byMonth === undefined && byMonthDay === undefined
        ? every(interval, "Daily", "days")
        : undefined;
    case "WEEKLY": {
      if (byMonth !== undefined || byMonthDay !== undefined) return undefined;
      const days = byDay?.map(({ weekday }) => weekday) ?? [weekdayOf(start)];
      if ((interval ?? 1) === 1 && shapeOf(rule) === shapeOf(presetRule("weekdays", start))) {
        return "Every weekday";
      }
      const names = list(
        weekdays.filter((day) => days.includes(day)).map((day) => weekdayName(day, locale)),
        locale,
      );
      return `${every(interval, "Weekly", "weeks")} on ${names}`;
    }
    case "MONTHLY": {
      if (byMonth !== undefined) return undefined;
      const prefix = every(interval, "Monthly", "months");
      if (byDay !== undefined) {
        const [only] = byDay;
        const ordinal = only?.ordinal === undefined ? undefined : ordinalName(only.ordinal);
        if (byDay.length !== 1 || byMonthDay !== undefined || only === undefined || !ordinal) {
          return undefined;
        }
        return `${prefix} on the ${ordinal} ${weekdayName(only.weekday, locale)}`;
      }
      const days = byMonthDay ?? [start.day];
      return days.every((day) => day > 0)
        ? `${prefix} on day ${list(days.map(String), locale)}`
        : undefined;
    }
    case "YEARLY": {
      if (byDay !== undefined) return undefined;
      const month = byMonth?.length === 1 ? byMonth[0]! : byMonth === undefined ? start.month : 0;
      const day =
        byMonthDay?.length === 1 ? byMonthDay[0]! : byMonthDay === undefined ? start.day : 0;
      if (month === 0 || day <= 0) return undefined;
      // A leap year, so 29 February has a date to format.
      const shown = Temporal.PlainDate.from({ day, month, year: 2024 }).toLocaleString(locale, {
        day: "numeric",
        month: "long",
      });
      return `${every(interval, "Annually", "years")} on ${shown}`;
    }
    default:
      return undefined;
  }
}

/**
 * A rule in words, such as "Weekly on Monday, until December 31, 2026" or "Monthly on the second
 * Tuesday, 6 times", for a series starting on `start`. A timed series' UNTIL is read in
 * `timeZone`. Rules the words don't cover show their RRULE text.
 */
export function describeRule(
  rule: RecurrenceRule,
  start: Temporal.PlainDate,
  timeZone: string,
  locale: Intl.LocalesArgument,
): string {
  const shape =
    describeShape(rule, start, locale) ?? `Repeats ${formatRecurrenceRule(withoutEnd(rule))}`;
  const end = endOf(rule, timeZone);
  if (end.type === "count") return `${shape}, ${end.count} ${end.count === 1 ? "time" : "times"}`;
  if (end.type === "until") {
    const date = end.date.toLocaleString(locale, {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    return `${shape}, until ${date}`;
  }
  return shape;
}

/** The label of a preset for a series starting on `start`, as the Repeat field lists it. */
export function presetLabel(
  frequency: Exclude<RepeatFrequency, "custom">,
  start: Temporal.PlainDate,
  locale: Intl.LocalesArgument,
): string {
  if (frequency === "none") return "Does not repeat";
  if (frequency === "weekdays") return "Every weekday (Monday to Friday)";
  return describeShape(presetRule(frequency, start), start, locale) ?? frequency;
}

/** The presets the Repeat field offers, in order. */
export const repeatPresets = ["none", ...presets] as const;

/** Reads RRULE text the way the demo stores it; `undefined` when it holds no usable rule. */
export function readRule(text: string): RecurrenceRule | undefined {
  const { issues, rule } = parseRecurrenceRule(text);
  return issues.some(({ severity }) => severity === "error") ? undefined : rule;
}
