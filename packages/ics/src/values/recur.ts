import type {
  IcsDateValue,
  IcsFrequency,
  IcsRecurrenceRule,
  IcsWeekday,
  IcsWeekdayNumber,
} from "../types";
import { decodeDateValue, encodeDateValue, encodeInstant } from "./date-time";
import {
  failure,
  invalid,
  nested,
  quote,
  success,
  type IcsDecodeResult,
  type IcsValueWarning,
} from "./result";

type NumberListField =
  | "byHour"
  | "byMinute"
  | "byMonth"
  | "byMonthDay"
  | "bySecond"
  | "bySetPosition"
  | "byWeekNumber"
  | "byYearDay";

interface NumberListPart {
  readonly field: NumberListField;
  readonly max: number;
  /** Signed parts count from the end when negative, and never hold 0. */
  readonly min: number;
}

const NUMBER_LIST_PARTS: ReadonlyMap<string, NumberListPart> = new Map([
  ["BYSECOND", { field: "bySecond", max: 60, min: 0 }],
  ["BYMINUTE", { field: "byMinute", max: 59, min: 0 }],
  ["BYHOUR", { field: "byHour", max: 23, min: 0 }],
  ["BYMONTHDAY", { field: "byMonthDay", max: 31, min: -31 }],
  ["BYYEARDAY", { field: "byYearDay", max: 366, min: -366 }],
  ["BYWEEKNO", { field: "byWeekNumber", max: 53, min: -53 }],
  ["BYMONTH", { field: "byMonth", max: 12, min: 1 }],
  ["BYSETPOS", { field: "bySetPosition", max: 366, min: -366 }],
]);

const FREQUENCIES: ReadonlySet<string> = new Set<IcsFrequency>([
  "DAILY",
  "HOURLY",
  "MINUTELY",
  "MONTHLY",
  "SECONDLY",
  "WEEKLY",
  "YEARLY",
]);

const WEEKDAYS: ReadonlySet<string> = new Set<IcsWeekday>([
  "FR",
  "MO",
  "SA",
  "SU",
  "TH",
  "TU",
  "WE",
]);

const WEEKDAY_NUMBER = /^([+-]?\d{1,2})?([A-Z]{2})$/;
const INTEGER = /^[+-]?\d{1,9}$/;

type MutableRule = { -readonly [K in keyof IcsRecurrenceRule]: IcsRecurrenceRule[K] };

function integer(text: string): number | undefined {
  return INTEGER.test(text) ? Number(text) : undefined;
}

function numberList(text: string, { max, min }: NumberListPart): number[] | undefined {
  const values = text.split(",").map(integer);
  return values.every(
    (value) => value !== undefined && value >= min && value <= max && (min >= 0 || value !== 0),
  )
    ? (values as number[])
    : undefined;
}

function weekdayList(text: string): IcsWeekdayNumber[] | undefined {
  const days: IcsWeekdayNumber[] = [];
  for (const item of text.split(",")) {
    const [, ordinal, weekday] = WEEKDAY_NUMBER.exec(item) ?? [];
    const number = ordinal === undefined ? undefined : Number(ordinal);
    if (
      weekday === undefined ||
      !WEEKDAYS.has(weekday) ||
      number === 0 ||
      Math.abs(number ?? 0) > 53
    ) {
      return undefined;
    }
    days.push(
      number === undefined
        ? { weekday: weekday as IcsWeekday }
        : { ordinal: number, weekday: weekday as IcsWeekday },
    );
  }
  return days;
}

/** Parses every rule part, in any order and any case. Invalid parts are dropped with a warning. */
export function decodeRecur(raw: string): IcsDecodeResult<IcsRecurrenceRule> {
  const rule: Partial<MutableRule> = {};
  const seen = new Set<string>();
  const warnings: IcsValueWarning[] = [];
  const unsupported: string[] = [];
  const drop = (part: string, why: string) =>
    warnings.push(invalid(`dropped ${quote(part)}: ${why}`));

  for (const part of raw.split(";")) {
    if (part === "") {
      continue;
    }

    const equals = part.indexOf("=");
    if (equals === -1) {
      drop(part, "not NAME=VALUE");
      continue;
    }
    const name = part.slice(0, equals).toUpperCase();
    const value = part.slice(equals + 1).toUpperCase();
    if (seen.has(name)) {
      drop(part, `${name} already appeared; the first one wins`);
      continue;
    }
    seen.add(name);

    const numbers = NUMBER_LIST_PARTS.get(name);
    if (numbers !== undefined) {
      const list = numberList(value, numbers);
      if (list === undefined) {
        drop(part, `${name} takes integers from ${numbers.min} to ${numbers.max}`);
      } else {
        rule[numbers.field] = list;
      }
      continue;
    }

    switch (name) {
      case "FREQ":
        if (!FREQUENCIES.has(value)) {
          return failure(`${quote(value)} isn't a recurrence frequency`);
        }
        rule.frequency = value as IcsFrequency;
        break;
      case "UNTIL": {
        const until = decodeDateValue(value, undefined, {});
        if (until.ok) {
          rule.until = until.value;
          warnings.push(...nested("UNTIL", until));
        } else {
          drop(part, until.message);
        }
        break;
      }
      case "COUNT":
      case "INTERVAL": {
        const number = integer(value);
        if (number === undefined || number < 1) {
          drop(part, `${name} takes a positive integer`);
        } else {
          rule[name === "COUNT" ? "count" : "interval"] = number;
        }
        break;
      }
      case "BYDAY": {
        const days = weekdayList(value);
        if (days === undefined) {
          drop(part, "BYDAY takes weekdays such as MO, 1MO or -1FR");
        } else {
          rule.byDay = days;
        }
        break;
      }
      case "WKST":
        if (WEEKDAYS.has(value)) {
          rule.weekStart = value as IcsWeekday;
        } else {
          drop(part, "WKST takes a weekday");
        }
        break;
      default:
        unsupported.push(name);
    }
  }

  const { frequency } = rule;
  if (frequency === undefined) {
    return failure(`${quote(raw)} has no FREQ, which a recurrence rule requires`);
  }
  if (rule.count !== undefined && rule.until !== undefined) {
    warnings.push({
      code: "conflicting-properties",
      message: "COUNT with UNTIL, which RFC 5545 doesn't allow; kept both",
    });
  }
  if (unsupported.length > 0) {
    warnings.push({
      code: "unsupported",
      message: `unsupported rule parts ignored: ${unsupported.join(", ")}`,
    });
  }
  return success({ ...rule, frequency }, warnings);
}

// RRULE can't carry a TZID, so a zoned UNTIL is written as the UTC instant it names.
function encodeUntil(until: IcsDateValue): string {
  return until.kind === "zoned" ? encodeInstant(until.zoned.toInstant()) : encodeDateValue(until);
}

/** Writes the parts in RFC 5545's grammar order, FREQ first; empty lists are left out. */
export function encodeRecur(rule: IcsRecurrenceRule): string {
  const parts: [string, number | string | undefined][] = [
    ["FREQ", rule.frequency],
    ["UNTIL", rule.until && encodeUntil(rule.until)],
    ["COUNT", rule.count],
    ["INTERVAL", rule.interval],
    ["BYSECOND", rule.bySecond?.join(",")],
    ["BYMINUTE", rule.byMinute?.join(",")],
    ["BYHOUR", rule.byHour?.join(",")],
    ["BYDAY", rule.byDay?.map(({ ordinal, weekday }) => `${ordinal ?? ""}${weekday}`).join(",")],
    ["BYMONTHDAY", rule.byMonthDay?.join(",")],
    ["BYYEARDAY", rule.byYearDay?.join(",")],
    ["BYWEEKNO", rule.byWeekNumber?.join(",")],
    ["BYMONTH", rule.byMonth?.join(",")],
    ["BYSETPOS", rule.bySetPosition?.join(",")],
    ["WKST", rule.weekStart],
  ];
  return parts
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([name, value]) => `${name}=${value}`)
    .join(";");
}
