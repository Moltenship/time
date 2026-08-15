const DAYS_PER_YEAR_KEY = 12n * 32n;
const NANOSECONDS_PER_SECOND = 1_000_000_000n;
const SECONDS_PER_MINUTE = 60n;
const MINUTES_PER_HOUR = 60n;
const HOURS_PER_DAY = 24n;
const NANOSECONDS_PER_DAY =
  NANOSECONDS_PER_SECOND * SECONDS_PER_MINUTE * MINUTES_PER_HOUR * HOURS_PER_DAY;

function isoDateFieldsKey(year: number, month: number, day: number): bigint {
  return BigInt(year) * DAYS_PER_YEAR_KEY + BigInt(month - 1) * 32n + BigInt(day - 1);
}

export function instantIndexKey(instant: Temporal.Instant): bigint {
  return instant.epochNanoseconds;
}

export function plainDateIndexKey(date: Temporal.PlainDate): bigint {
  const isoDate = date.calendarId === "iso8601" ? date : date.withCalendar("iso8601");
  return isoDateFieldsKey(isoDate.year, isoDate.month, isoDate.day);
}

export function plainDateTimeIndexKey(dateTime: Temporal.PlainDateTime): bigint {
  const isoDateTime =
    dateTime.calendarId === "iso8601" ? dateTime : dateTime.withCalendar("iso8601");
  const nanosecondsWithinSecond =
    BigInt(isoDateTime.millisecond) * 1_000_000n +
    BigInt(isoDateTime.microsecond) * 1_000n +
    BigInt(isoDateTime.nanosecond);
  const secondsWithinDay =
    BigInt(isoDateTime.hour) * MINUTES_PER_HOUR * SECONDS_PER_MINUTE +
    BigInt(isoDateTime.minute) * SECONDS_PER_MINUTE +
    BigInt(isoDateTime.second);

  return (
    isoDateFieldsKey(isoDateTime.year, isoDateTime.month, isoDateTime.day) * NANOSECONDS_PER_DAY +
    secondsWithinDay * NANOSECONDS_PER_SECOND +
    nanosecondsWithinSecond
  );
}
