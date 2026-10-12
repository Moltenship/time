import type { IcsDate, IcsDateTime, IcsDateValue, IcsTime } from "../types";
import {
  failure,
  invalid,
  quote,
  success,
  type IcsDecodeResult,
  type IcsValueContext,
  type IcsValueWarning,
} from "./result";

const DATE = /^(\d{4})(\d{2})(\d{2})$/;
const DATE_TIME = /^(\d{4})(\d{2})(\d{2})([Tt])(\d{2})(\d{2})(\d{2})?([Zz])?$/;
const TIME = /^(\d{2})(\d{2})(\d{2})?([Zz])?$/;
const MAX_CACHED_TIME_ZONES = 512;

const temporalTimeZones = new Map<string, string | undefined>();

/** The id Temporal uses for `id`, or `undefined` when it isn't a time zone Temporal knows. */
function temporalTimeZoneId(id: string): string | undefined {
  if (temporalTimeZones.has(id)) {
    return temporalTimeZones.get(id);
  }

  let resolved: string | undefined;
  try {
    resolved = new Temporal.ZonedDateTime(0n, id).timeZoneId;
  } catch {
    resolved = undefined;
  }
  if (temporalTimeZones.size >= MAX_CACHED_TIME_ZONES) {
    temporalTimeZones.clear();
  }
  temporalTimeZones.set(id, resolved);
  return resolved;
}

function resolveTimeZone(tzid: string, context: IcsValueContext): string | undefined {
  const id = context.resolveTimeZone ? context.resolveTimeZone(tzid) : tzid;
  return id === undefined ? undefined : temporalTimeZoneId(id);
}

// Second 60 is a leap second, which RFC 5545 allows and Temporal doesn't.
function lenientSecond(
  second: string | undefined,
  lowercase: boolean,
): { readonly second: number; readonly warnings: IcsValueWarning[] } {
  const warnings: IcsValueWarning[] = [];
  if (lowercase) {
    warnings.push(invalid("lowercase T or Z; read as uppercase"));
  }
  if (second === undefined) {
    warnings.push(invalid("no seconds; read as :00"));
  } else if (second === "60") {
    warnings.push(invalid("second 60 (a leap second); read as 59"));
  }
  return { second: second === undefined ? 0 : Math.min(Number(second), 59), warnings };
}

export function decodeDate(raw: string): IcsDecodeResult<IcsDate> {
  const match = DATE.exec(raw);
  if (!match) {
    return failure(`${quote(raw)} isn't a DATE (YYYYMMDD)`);
  }

  try {
    const [, year, month, day] = match.map(Number);
    return success({
      date: Temporal.PlainDate.from(
        { day: day!, month: month!, year: year! },
        { overflow: "reject" },
      ),
      kind: "date",
    });
  } catch {
    return failure(`${quote(raw)} isn't a real date`);
  }
}

export function decodeDateTime(
  raw: string,
  context: IcsValueContext,
): IcsDecodeResult<IcsDateTime> {
  const match = DATE_TIME.exec(raw);
  if (!match) {
    return failure(`${quote(raw)} isn't a DATE-TIME (YYYYMMDDTHHMMSS, optionally ending in Z)`);
  }

  const [, year, month, day, t, hour, minute, second, z] = match;
  const { second: seconds, warnings } = lenientSecond(second, t === "t" || z === "z");
  let wallTime: Temporal.PlainDateTime;
  try {
    wallTime = Temporal.PlainDateTime.from(
      {
        day: Number(day),
        hour: Number(hour),
        minute: Number(minute),
        month: Number(month),
        second: seconds,
        year: Number(year),
      },
      { overflow: "reject" },
    );
  } catch {
    return failure(`${quote(raw)} isn't a real date and time`);
  }

  let { tzid } = context;
  if (tzid === "") {
    warnings.push(invalid("an empty TZID; ignored"));
    tzid = undefined;
  }
  if (z !== undefined) {
    if (tzid !== undefined) {
      warnings.push(invalid(`UTC time with TZID ${quote(tzid)}; the Z wins`));
    }
    return success({ instant: wallTime.toZonedDateTime("UTC").toInstant(), kind: "utc" }, warnings);
  }

  if (tzid === undefined) {
    return success({ kind: "floating", wallTime }, warnings);
  }

  const timeZone = resolveTimeZone(tzid, context);
  return success(
    timeZone === undefined
      ? { kind: "unresolved", tzid, wallTime }
      : {
          kind: "zoned",
          tzid,
          wallTime,
          zoned: wallTime.toZonedDateTime(timeZone, { disambiguation: "compatible" }),
        },
    warnings,
  );
}

/** Decodes a DATE or DATE-TIME by its shape, warning when it isn't the declared type. */
export function decodeDateValue(
  raw: string,
  declared: "DATE" | "DATE-TIME" | undefined,
  context: IcsValueContext,
): IcsDecodeResult<IcsDateValue> {
  const actual = DATE.test(raw) ? "DATE" : DATE_TIME.test(raw) ? "DATE-TIME" : declared;
  const result = actual === "DATE" ? decodeDate(raw) : decodeDateTime(raw, context);
  if (!result.ok || declared === undefined || actual === declared) {
    return result;
  }

  return success(result.value, [
    invalid(`a ${actual} where ${declared} is declared; read as ${actual}`),
    ...(result.warnings ?? []),
  ]);
}

export function decodeTime(raw: string): IcsDecodeResult<IcsTime> {
  const match = TIME.exec(raw);
  if (!match) {
    return failure(`${quote(raw)} isn't a TIME (HHMMSS, optionally ending in Z)`);
  }

  const [, hour, minute, second, z] = match;
  const { second: seconds, warnings } = lenientSecond(second, z === "z");
  try {
    const time = Temporal.PlainTime.from(
      { hour: Number(hour), minute: Number(minute), second: seconds },
      { overflow: "reject" },
    );
    return success({ time, utc: z !== undefined }, warnings);
  } catch {
    return failure(`${quote(raw)} isn't a real time`);
  }
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

export function encodeDate(date: Temporal.PlainDate): string {
  if (date.year < 0 || date.year > 9999) {
    throw new RangeError(`iCalendar can't write the year ${date.year}`);
  }
  return `${pad(date.year, 4)}${pad(date.month)}${pad(date.day)}`;
}

export function encodeTime(time: Temporal.PlainTime | Temporal.PlainDateTime): string {
  return `${pad(time.hour)}${pad(time.minute)}${pad(time.second)}`;
}

function encodeWallTime(wallTime: Temporal.PlainDateTime): string {
  return `${encodeDate(wallTime.toPlainDate())}T${encodeTime(wallTime)}`;
}

export function encodeInstant(instant: Temporal.Instant): string {
  return `${encodeWallTime(instant.toZonedDateTimeISO("UTC").toPlainDateTime())}Z`;
}

/** Writes a DATE or DATE-TIME by its kind. Sub-second parts are dropped: iCalendar has none. */
export function encodeDateValue(value: IcsDateValue): string {
  switch (value.kind) {
    case "date":
      return encodeDate(value.date);
    case "utc":
      return encodeInstant(value.instant);
    default:
      return encodeWallTime(value.wallTime);
  }
}
