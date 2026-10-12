// Value layer: raw property values ⇄ typed values. Owned by the values work package.

import type { IcsDateValue, IcsDecodedValueMap, IcsProperty, IcsValueType } from "../types";

export interface IcsValueContext {
  /**
   * Resolves a TZID to an IANA time zone id, or `undefined`. Without it, a TZID resolves only when
   * it is itself a time zone id Temporal knows.
   */
  readonly resolveTimeZone?: (tzid: string) => string | undefined;
  /** The property's TZID parameter. */
  readonly tzid?: string;
}

export type IcsDecodeResult<T> =
  | { readonly ok: false; readonly message: string }
  | { readonly ok: true; readonly value: T; readonly warning?: string };

/** The property's value type: its VALUE parameter, else its registered default, else TEXT. */
export function icsValueTypeOf(property: IcsProperty): IcsValueType {
  void property;
  throw new Error("not implemented: icsValueTypeOf");
}

/** Decodes one raw value (no list splitting) as `type`. */
export function decodeIcsValue<TType extends IcsValueType>(
  type: TType,
  raw: string,
  context?: IcsValueContext,
): IcsDecodeResult<IcsDecodedValueMap[TType]> {
  void type;
  void raw;
  void context;
  throw new Error("not implemented: decodeIcsValue");
}

/** Splits a list value on its separating commas and decodes each item as `type`. */
export function decodeIcsValues<TType extends IcsValueType>(
  type: TType,
  raw: string,
  context?: IcsValueContext,
): IcsDecodeResult<IcsDecodedValueMap[TType]>[] {
  void type;
  void raw;
  void context;
  throw new Error("not implemented: decodeIcsValues");
}

/**
 * Decodes a DATE or DATE-TIME by its shape, so a date written without `VALUE=DATE` still decodes
 * (with a warning). `declared` is the property's value type.
 */
export function decodeIcsDateValue(
  raw: string,
  declared: "DATE" | "DATE-TIME",
  context?: IcsValueContext,
): IcsDecodeResult<IcsDateValue> {
  void raw;
  void declared;
  void context;
  throw new Error("not implemented: decodeIcsDateValue");
}

/**
 * Encodes one value as raw property text. Zoned and unresolved DATE-TIMEs are written as their wall
 * time; writing the TZID parameter is the caller's job.
 */
export function encodeIcsValue<TType extends IcsValueType>(
  type: TType,
  value: IcsDecodedValueMap[TType],
): string {
  void type;
  void value;
  throw new Error("not implemented: encodeIcsValue");
}
