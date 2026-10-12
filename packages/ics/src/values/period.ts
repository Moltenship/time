import type { IcsPeriod } from "../types";
import { decodeDateTime, encodeDateValue } from "./date-time";
import { decodeDuration, encodeDuration } from "./duration";
import { failure, quote, success, type IcsDecodeResult, type IcsValueContext } from "./result";

export function decodePeriod(raw: string, context: IcsValueContext): IcsDecodeResult<IcsPeriod> {
  const slash = raw.indexOf("/");
  if (slash === -1) {
    return failure(`${quote(raw)} isn't a PERIOD (start/end or start/duration)`);
  }

  const start = decodeDateTime(raw.slice(0, slash), context);
  if (!start.ok) {
    return failure(`PERIOD start: ${start.message}`);
  }

  const endText = raw.slice(slash + 1);
  const warnings = start.warning === undefined ? [] : [`PERIOD start: ${start.warning}`];
  if (/^[+-]?P/i.test(endText)) {
    const duration = decodeDuration(endText);
    if (!duration.ok) {
      return failure(`PERIOD duration: ${duration.message}`);
    }
    if (duration.warning !== undefined) {
      warnings.push(`PERIOD duration: ${duration.warning}`);
    }
    if (duration.value.sign < 0) {
      warnings.push("a PERIOD with a negative duration, which RFC 5545 doesn't allow");
    }
    return success({ duration: duration.value, start: start.value }, warnings);
  }

  const end = decodeDateTime(endText, context);
  if (!end.ok) {
    return failure(`PERIOD end: ${end.message}`);
  }
  if (end.warning !== undefined) {
    warnings.push(`PERIOD end: ${end.warning}`);
  }
  return success({ end: end.value, start: start.value }, warnings);
}

export function encodePeriod(period: IcsPeriod): string {
  const end = "duration" in period ? encodeDuration(period.duration) : encodeDateValue(period.end);
  return `${encodeDateValue(period.start)}/${end}`;
}
