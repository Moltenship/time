import type { IcsUtcOffset } from "../types";
import { failure, invalid, quote, success, type IcsDecodeResult } from "./result";

const UTC_OFFSET = /^([+-])?(\d{2}):?(\d{2})(?::?(\d{2}))?$/;
const OFFSET_STRING = /^([+-])(\d{2}):(\d{2})(?::(\d{2}))?$/;

export function decodeUtcOffset(raw: string): IcsDecodeResult<IcsUtcOffset> {
  const match = UTC_OFFSET.exec(raw);
  if (!match) {
    return failure(`${quote(raw)} isn't a UTC-OFFSET (±HHMM or ±HHMMSS)`);
  }

  const [, sign, hours, minutes, seconds] = match;
  if (Number(hours) > 23 || Number(minutes) > 59 || Number(seconds ?? 0) > 59) {
    return failure(`${quote(raw)} is out of range for a UTC-OFFSET`);
  }

  const warnings: string[] = [];
  if (sign === undefined) {
    warnings.push("a UTC-OFFSET without a sign; read as +");
  }
  if (raw.includes(":")) {
    warnings.push("a UTC-OFFSET with colons; read without");
  }
  const zero = Number(hours) + Number(minutes) + Number(seconds ?? 0) === 0;
  if (zero && sign === "-") {
    warnings.push("-0000 isn't a valid UTC-OFFSET; read as +0000");
  }
  const positive = sign !== "-" || zero;
  return success(
    `${positive ? "+" : "-"}${hours}:${minutes}${seconds === undefined ? "" : `:${seconds}`}`,
    warnings.map(invalid),
  );
}

export function encodeUtcOffset(offset: IcsUtcOffset): string {
  const match = OFFSET_STRING.exec(offset);
  if (!match) {
    throw new RangeError(`Not a ±HH:MM[:SS] offset: ${offset}`);
  }

  const [, sign, hours, minutes, seconds = ""] = match;
  return `${/^0+$/.test(`${hours}${minutes}${seconds}`) ? "+" : sign}${hours}${minutes}${seconds}`;
}
