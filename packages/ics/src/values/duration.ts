import { failure, invalid, quote, success, type IcsDecodeResult } from "./result";

const DURATION = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:(T)(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

/** Keeps the units as written: `P1D` and `PT24H` differ across a DST change. */
export function decodeDuration(raw: string): IcsDecodeResult<Temporal.Duration> {
  const upper = raw.toUpperCase();
  const [, sign, weeks, days, t, hours, minutes, seconds] = DURATION.exec(upper) ?? [];
  const time = [hours, minutes, seconds];
  if (
    [weeks, days, ...time].every((unit) => unit === undefined) ||
    (t !== undefined && time.every((unit) => unit === undefined))
  ) {
    return failure(`${quote(raw)} isn't a DURATION (such as P1D, PT1H30M or -P2W)`);
  }

  const warnings: string[] = [];
  if (upper !== raw) {
    warnings.push("lowercase DURATION; read as uppercase");
  }
  if (weeks !== undefined && (days ?? t) !== undefined) {
    warnings.push("weeks with other units, which RFC 5545 doesn't allow; kept both");
  }
  if (hours !== undefined && minutes === undefined && seconds !== undefined) {
    warnings.push("hours and seconds without minutes, which RFC 5545 doesn't allow");
  }

  try {
    const duration = Temporal.Duration.from({
      days: Number(days ?? 0),
      hours: Number(hours ?? 0),
      minutes: Number(minutes ?? 0),
      seconds: Number(seconds ?? 0),
      weeks: Number(weeks ?? 0),
    });
    return success(sign === "-" ? duration.negated() : duration, warnings.map(invalid));
  } catch {
    return failure(`${quote(raw)} is longer than a Temporal.Duration can hold`);
  }
}

/** Sub-second parts are dropped: iCalendar has none. Years and months have no iCalendar form. */
export function encodeDuration(duration: Temporal.Duration): string {
  if (duration.years !== 0 || duration.months !== 0) {
    throw new RangeError(
      `iCalendar can't write a DURATION in years or months: ${duration.toString()}`,
    );
  }

  const { days, hours, minutes, seconds, weeks } = duration.abs();
  // RFC 5545 lets the time part skip leading and trailing units but not middle ones: PT1H0M5S.
  const time: [number, string][] = [
    [hours, "H"],
    [minutes, "M"],
    [seconds, "S"],
  ];
  const first = time.findIndex(([value]) => value !== 0);
  const last = time.findLastIndex(([value]) => value !== 0);
  const date = `${weeks === 0 ? "" : `${weeks}W`}${days === 0 ? "" : `${days}D`}`;
  const clock =
    first === -1
      ? ""
      : `T${time
          .slice(first, last + 1)
          .map(([value, unit]) => `${value}${unit}`)
          .join("")}`;
  if (date === "" && clock === "") {
    return "PT0S";
  }
  return `${duration.sign < 0 ? "-" : ""}P${date}${clock}`;
}
