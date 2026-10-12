// Proleptic Gregorian arithmetic on whole days since 1970-01-01, "epoch days", and on wall
// seconds, `epochDay * 86_400 + secondOfDay`. The rule loop runs on these numbers and makes
// Temporal values only for the dates it returns. Day conversions follow Howard Hinnant's
// "chrono-Compatible Low-Level Date Algorithms".

export const SECONDS_PER_DAY = 86_400;

/** The last day the engine reaches, a little inside Temporal's limit of 10^8 days. */
export const LAST_DAY = 99_999_990;

export function floorDiv(dividend: number, divisor: number): number {
  return Math.floor(dividend / divisor);
}

export function epochDay(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = floorDiv(y, 400);
  const yearOfEra = y - era * 400;
  const dayOfYear = floorDiv(153 * (month > 2 ? month - 3 : month + 9) + 2, 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + floorDiv(yearOfEra, 4) - floorDiv(yearOfEra, 100) + dayOfYear;
  return era * 146_097 + dayOfEra - 719_468;
}

export interface CivilDate {
  readonly day: number;
  readonly month: number;
  readonly year: number;
}

export function civilDate(days: number): CivilDate {
  const shifted = days + 719_468;
  const era = floorDiv(shifted, 146_097);
  const dayOfEra = shifted - era * 146_097;
  const yearOfEra = floorDiv(
    dayOfEra - floorDiv(dayOfEra, 1460) + floorDiv(dayOfEra, 36_524) - floorDiv(dayOfEra, 146_096),
    365,
  );
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + floorDiv(yearOfEra, 4) - floorDiv(yearOfEra, 100));
  const shiftedMonth = floorDiv(5 * dayOfYear + 2, 153);
  const month = shiftedMonth < 10 ? shiftedMonth + 3 : shiftedMonth - 9;
  return {
    day: dayOfYear - floorDiv(153 * shiftedMonth + 2, 5) + 1,
    month,
    year: yearOfEra + era * 400 + (month <= 2 ? 1 : 0),
  };
}

/** ISO weekday: Monday is 1, Sunday 7. 1970-01-01 was a Thursday. */
export function weekday(days: number): number {
  return ((((days + 3) % 7) + 7) % 7) + 1;
}

export function yearLength(year: number): number {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 366 : 365;
}

export function monthLength(year: number, month: number): number {
  if (month === 2) return yearLength(year) === 366 ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/** Wall seconds of an ISO date and time, leaving out fractions of a second. */
export function wallSeconds(
  fields: Temporal.PlainDate | Temporal.PlainDateTime | Temporal.ZonedDateTime,
): number {
  const iso = fields.withCalendar("iso8601");
  const day = epochDay(iso.year, iso.month, iso.day) * SECONDS_PER_DAY;
  return iso instanceof Temporal.PlainDate
    ? day
    : day + iso.hour * 3600 + iso.minute * 60 + iso.second;
}

/** Fractions of a second, in nanoseconds. */
export function subsecond(fields: Temporal.PlainDateTime | Temporal.ZonedDateTime): number {
  return fields.millisecond * 1_000_000 + fields.microsecond * 1000 + fields.nanosecond;
}

export function toPlainDate(wall: number): Temporal.PlainDate {
  const { day, month, year } = civilDate(floorDiv(wall, SECONDS_PER_DAY));
  return new Temporal.PlainDate(year, month, day);
}

export function toPlainDateTime(wall: number, nanoseconds = 0): Temporal.PlainDateTime {
  const days = floorDiv(wall, SECONDS_PER_DAY);
  const { day, month, year } = civilDate(days);
  const second = wall - days * SECONDS_PER_DAY;
  return new Temporal.PlainDateTime(
    year,
    month,
    day,
    floorDiv(second, 3600),
    floorDiv(second % 3600, 60),
    second % 60,
    floorDiv(nanoseconds, 1_000_000),
    floorDiv(nanoseconds % 1_000_000, 1000),
    nanoseconds % 1000,
  );
}
