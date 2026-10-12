// TZID → IANA time zone resolution. Owned by the time-zones work package.

import type { IcsComponent, IcsTimeZoneResolver } from "../types";

export interface TimeZoneResolverOptions {
  /** Consulted first; `undefined` falls through to the built-in rules. */
  readonly custom?: IcsTimeZoneResolver;
  /** The calendar's VTIMEZONE components, keyed by their TZID as written. */
  readonly definitions?: ReadonlyMap<string, IcsComponent>;
}

/** Builds a TZID resolver for one calendar. Results are cached per resolver. */
export function createTimeZoneResolver(
  options?: TimeZoneResolverOptions,
): (tzid: string) => string | undefined {
  void options;
  throw new Error("not implemented: createTimeZoneResolver");
}

/** The canonical id Temporal uses for `id`, or `undefined` when Temporal doesn't know it. */
export function canonicalTimeZoneId(id: string): string | undefined {
  void id;
  throw new Error("not implemented: canonicalTimeZoneId");
}
