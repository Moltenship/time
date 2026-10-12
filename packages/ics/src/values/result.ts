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

/** A success; several warnings join into one message. */
export function success<T>(value: T, warnings: readonly string[] = []): IcsDecodeResult<T> {
  return warnings.length === 0
    ? { ok: true, value }
    : { ok: true, value, warning: warnings.join("; ") };
}

export function failure(message: string): { readonly ok: false; readonly message: string } {
  return { ok: false, message };
}

/** The value for a message, cut short so a huge value doesn't end up in every issue. */
export function quote(raw: string): string {
  return JSON.stringify(raw.length > 48 ? `${raw.slice(0, 45)}...` : raw);
}
