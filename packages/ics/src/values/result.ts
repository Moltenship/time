import type { IcsIssueCode } from "../types";

export interface IcsValueContext {
  /**
   * Resolves a TZID to an IANA time zone id, or `undefined`. Without it, a TZID resolves only when
   * it is itself a time zone id Temporal knows.
   */
  readonly resolveTimeZone?: (tzid: string) => string | undefined;
  /** The property's TZID parameter. */
  readonly tzid?: string;
}

/** A deviation a decoder tolerated; the decoded value is its best reading. */
export interface IcsValueWarning {
  /** The code `parseIcs` reports it under, such as `invalid-value` or `unsupported`. */
  readonly code: IcsIssueCode;
  readonly message: string;
}

export type IcsDecodeResult<T> =
  | { readonly ok: false; readonly message: string }
  | {
      readonly ok: true;
      readonly value: T;
      /** Absent when the value decoded cleanly. */
      readonly warnings?: readonly IcsValueWarning[];
    };

export function success<T>(
  value: T,
  warnings: readonly IcsValueWarning[] = [],
): IcsDecodeResult<T> {
  return warnings.length === 0 ? { ok: true, value } : { ok: true, value, warnings };
}

export function failure(message: string): { readonly ok: false; readonly message: string } {
  return { ok: false, message };
}

/** A value that breaks RFC 5545 and was read anyway. */
export function invalid(message: string): IcsValueWarning {
  return { code: "invalid-value", message };
}

/** A part's warnings, such as an UNTIL's inside a RECUR, each prefixed with the part. */
export function nested(
  prefix: string,
  result: { readonly warnings?: readonly IcsValueWarning[] },
): IcsValueWarning[] {
  return (result.warnings ?? []).map(({ code, message }) => ({
    code,
    message: `${prefix}: ${message}`,
  }));
}

/** The value for a message, cut short so a huge value doesn't end up in every issue. */
export function quote(raw: string): string {
  return JSON.stringify(raw.length > 48 ? `${raw.slice(0, 45)}...` : raw);
}
