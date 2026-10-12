/**
 * A time zone identifier as Temporal spells it, such as "Asia/Tokyo" for "asia/tokyo", or `null`
 * when it isn't one. Only identifiers pass: an ISO date-time string with a zone in it doesn't.
 * Aliases stay as they are, so "Asia/Calcutta" stays "Asia/Calcutta".
 */
export function timeZoneIdOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    return new Temporal.ZonedDateTime(0n, value).timeZoneId;
  } catch {
    return null;
  }
}
