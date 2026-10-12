// What Temporal's data says about a zone's past offsets, to check a candidate zone against what
// the calendar claims about it.

// Temporal's earliest instant.
const EARLIEST = -8_640_000_000_000_000_000_000n;
const LAST_SAMPLED_YEAR = 2040;

// Keyed by zone and first year; only zones from the Windows table are sampled, so it stays small.
const samples = new Map<string, ReadonlySet<string>>();

// Whether `timeZone` can be the zone of a VTIMEZONE whose observances move to `offsets`, in
// seconds: it changed its offset since 1970, or else had each of them before. This rejects zones
// that never change offset; a zone that does passes without its offsets being compared.
export function fitsDefinitionOffsets(timeZone: string, offsets: ReadonlySet<number>): boolean {
  if (new Temporal.ZonedDateTime(0n, timeZone).getTimeZoneTransition("next") !== null) return true;
  // `EST` is fixed at −05:00 and mustn't stand in for a zone with DST, but a VTIMEZONE written
  // with a zone's whole history, such as Asia/Kolkata's, lists offsets from before 1970.
  const seen = new Set<number>();
  let zoned: Temporal.ZonedDateTime | null = new Temporal.ZonedDateTime(EARLIEST, timeZone);
  while (zoned !== null) {
    seen.add(zoned.offsetNanoseconds / 1e9);
    zoned = zoned.getTimeZoneTransition("next");
  }
  for (const offset of offsets) if (!seen.has(offset)) return false;
  return true;
}

// Whether `timeZone` had `offset` (`±HH:MM`) on 1 January or 1 July of a year from `from` through
// 2040.
export function hadOffset(timeZone: string, offset: string, from: number): boolean {
  const key = `${timeZone} ${from}`;
  let offsets = samples.get(key);
  if (offsets === undefined) {
    const sampled = new Set<string>();
    for (let year = from; year <= LAST_SAMPLED_YEAR; year += 1) {
      for (const month of [1, 7]) {
        sampled.add(Temporal.ZonedDateTime.from({ day: 1, month, timeZone, year }).offset);
      }
    }
    offsets = sampled;
    samples.set(key, offsets);
  }
  return offsets.has(offset);
}
