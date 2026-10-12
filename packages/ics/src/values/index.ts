// Value layer: raw property values ⇄ typed values. Decoders never throw; encoders throw only for
// values iCalendar can't write, such as a DURATION in months.

import type { IcsDateValue, IcsDecodedValueMap, IcsValueType } from "../types";
import {
  decodeDate,
  decodeDateTime,
  decodeDateValue,
  decodeTime,
  encodeDateValue,
  encodeTime,
} from "./date-time";
import { decodeDuration, encodeDuration } from "./duration";
import { decodePeriod, encodePeriod } from "./period";
import { decodeRecur, encodeRecur } from "./recur";
import { failure, success, type IcsDecodeResult, type IcsValueContext } from "./result";
import {
  decodeBinary,
  decodeBoolean,
  decodeFloat,
  decodeInteger,
  encodeFloat,
  encodeInteger,
} from "./scalars";
import { decodeText, encodeText, splitList } from "./text";
import { decodeUtcOffset, encodeUtcOffset } from "./utc-offset";

export { icsValueTypeOf } from "./registry";
export type { IcsDecodeResult, IcsValueContext, IcsValueWarning } from "./result";

type Decoders = {
  readonly [TType in IcsValueType]: (
    raw: string,
    context: IcsValueContext,
  ) => IcsDecodeResult<IcsDecodedValueMap[TType]>;
};

type Encoders = {
  readonly [TType in IcsValueType]: (value: IcsDecodedValueMap[TType]) => string;
};

const asWritten = (raw: string) => success(raw);
const identity = (value: string) => value;

const DECODERS: Decoders = {
  BINARY: decodeBinary,
  BOOLEAN: decodeBoolean,
  "CAL-ADDRESS": asWritten,
  DATE: decodeDate,
  "DATE-TIME": decodeDateTime,
  DURATION: decodeDuration,
  FLOAT: decodeFloat,
  INTEGER: decodeInteger,
  PERIOD: decodePeriod,
  RECUR: decodeRecur,
  TEXT: decodeText,
  TIME: decodeTime,
  URI: asWritten,
  "UTC-OFFSET": decodeUtcOffset,
};

const ENCODERS: Encoders = {
  BINARY: identity,
  BOOLEAN: (value) => (value ? "TRUE" : "FALSE"),
  "CAL-ADDRESS": identity,
  DATE: encodeDateValue,
  "DATE-TIME": encodeDateValue,
  DURATION: encodeDuration,
  FLOAT: encodeFloat,
  INTEGER: encodeInteger,
  PERIOD: encodePeriod,
  RECUR: encodeRecur,
  TEXT: encodeText,
  TIME: ({ time, utc }) => `${encodeTime(time)}${utc ? "Z" : ""}`,
  URI: identity,
  "UTC-OFFSET": encodeUtcOffset,
};

/**
 * Decodes one raw value as `type`. It doesn't split lists: use `decodeIcsValues` for a property
 * such as CATEGORIES or EXDATE. Never throws: a value that doesn't parse is `{ ok: false }`, and
 * one read leniently carries `warnings`.
 */
export function decodeIcsValue<TType extends IcsValueType>(
  type: TType,
  raw: string,
  context: IcsValueContext = {},
): IcsDecodeResult<IcsDecodedValueMap[TType]> {
  return Object.hasOwn(DECODERS, type)
    ? DECODERS[type](raw, context)
    : failure(`Unknown value type ${JSON.stringify(type)}`);
}

/**
 * The items of a list value, such as CATEGORIES or EXDATE, as raw text: split on separating
 * commas, TEXT escapes left in place, so `a\,b,c` gives `a\,b` and `c`. RECUR, whose parts hold
 * commas, is never split.
 */
export function splitIcsValues(type: IcsValueType, raw: string): string[] {
  return splitList(type, raw);
}

/**
 * Splits a list value on its separating commas and decodes each item as `type`: one result per
 * item, in order, so one bad item doesn't lose the others.
 */
export function decodeIcsValues<TType extends IcsValueType>(
  type: TType,
  raw: string,
  context: IcsValueContext = {},
): IcsDecodeResult<IcsDecodedValueMap[TType]>[] {
  return splitList(type, raw).map((item) => decodeIcsValue(type, item, context));
}

/**
 * Decodes a DATE or DATE-TIME by its shape, so a date written without `VALUE=DATE` still decodes
 * (with a warning). `declared` is the property's value type, as `icsValueTypeOf` gives it. Use it
 * for DTSTART, DTEND, DUE, RECURRENCE-ID and each item of EXDATE or RDATE.
 */
export function decodeIcsDateValue(
  raw: string,
  declared: "DATE" | "DATE-TIME",
  context: IcsValueContext = {},
): IcsDecodeResult<IcsDateValue> {
  return decodeDateValue(raw, declared, context);
}

/**
 * Encodes one value as raw property text. Zoned and unresolved DATE-TIMEs are written as their wall
 * time; writing the TZID parameter is the caller's job.
 */
export function encodeIcsValue<TType extends IcsValueType>(
  type: TType,
  value: IcsDecodedValueMap[TType],
): string {
  if (!Object.hasOwn(ENCODERS, type)) {
    throw new TypeError(`Unknown value type ${JSON.stringify(type)}`);
  }
  return ENCODERS[type](value);
}
