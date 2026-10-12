import { failure, quote, success, type IcsDecodeResult } from "./result";

const INTEGER = /^[+-]?\d+$/;
const FLOAT = /^[+-]?\d+(?:\.\d+)?$/;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const EXPONENT = /^(-?)(\d+)(?:\.(\d+))?e([+-]\d+)$/;

export function decodeInteger(raw: string): IcsDecodeResult<number> {
  const value = Number(raw);
  return INTEGER.test(raw) && Number.isSafeInteger(value)
    ? success(value)
    : failure(`${quote(raw)} isn't an INTEGER`);
}

export function decodeFloat(raw: string): IcsDecodeResult<number> {
  const value = Number(raw);
  return FLOAT.test(raw) && Number.isFinite(value)
    ? success(value)
    : failure(`${quote(raw)} isn't a FLOAT`);
}

export function decodeBoolean(raw: string): IcsDecodeResult<boolean> {
  const upper = raw.toUpperCase();
  return upper === "TRUE" || upper === "FALSE"
    ? success(upper === "TRUE")
    : failure(`${quote(raw)} isn't a BOOLEAN (TRUE or FALSE)`);
}

/** Checks the alphabet only; the data stays as written. */
export function decodeBinary(raw: string): IcsDecodeResult<string> {
  return BASE64.test(raw) ? success(raw) : failure(`${quote(raw)} isn't base64`);
}

export function encodeInteger(value: number): string {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Not an integer: ${value}`);
  }
  return String(value);
}

// FLOAT has no exponent form, so `1e-7` is spelled out as `0.0000001`.
export function encodeFloat(value: number): string {
  if (!Number.isFinite(value)) {
    throw new RangeError(`iCalendar can't write the FLOAT ${value}`);
  }

  const text = Object.is(value, -0) ? "-0" : String(value);
  const [, sign, whole, fraction = "", exponent] = EXPONENT.exec(text) ?? [];
  if (whole === undefined) {
    return text;
  }

  const digits = `${whole}${fraction}`;
  const point = whole.length + Number(exponent);
  if (point <= 0) {
    return `${sign}0.${"0".repeat(-point)}${digits}`;
  }
  return point >= digits.length
    ? `${sign}${digits}${"0".repeat(point - digits.length)}`
    : `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}
