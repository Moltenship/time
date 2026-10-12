// A feed can carry any number of distinct TZIDs; the cap keeps a long-lived process from growing.
const CACHE_LIMIT = 1024;
const cache = new Map<string, string | undefined>();

// Named ids keep the alias that was asked for, with its case normalized (`asia/calcutta` →
// `Asia/Calcutta`); offsets come back as `±HH:MM` (`+0530` → `+05:30`, `-00:00` → `+00:00`).
/** The canonical id Temporal uses for `id`, or `undefined` when Temporal doesn't know it. */
export function canonicalTimeZoneId(id: string): string | undefined {
  if (cache.has(id)) return cache.get(id);

  let canonical: string | undefined;
  try {
    // Unlike `ZonedDateTime.from`, the constructor takes identifiers only, not ISO date-times.
    canonical = new Temporal.ZonedDateTime(0n, id).timeZoneId;
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
  }

  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(id, canonical);
  return canonical;
}

// Temporal's offset time zones have whole minutes and stay under 24 hours; anything else is
// `undefined`.
export function offsetTimeZoneId(
  sign: string,
  hours: number,
  minutes: number,
  seconds = 0,
): string | undefined {
  if (minutes > 59 || seconds !== 0) return undefined;
  const pad = (value: number) => String(value).padStart(2, "0");
  return canonicalTimeZoneId(`${sign === "-" ? "-" : "+"}${pad(hours)}:${pad(minutes)}`);
}
