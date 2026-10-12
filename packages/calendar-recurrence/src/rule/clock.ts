import { toPlainDateTime } from "./calendar";

// Wall times this far from an offset change can have only one reading. Offsets differ by at most
// a day (Samoa skipped 30 December 2011), so two days is safe.
const MARGIN = 2 * 86_400;

/**
 * Resolves wall seconds in one time zone to epoch seconds as RFC 5545 §3.3.5 does, which is
 * Temporal's `compatible`: a time in a gap moves forward by the gap's length, and a repeated time
 * takes its first instant. Remembers the stretch between two offset changes, so most wall times
 * resolve without Temporal.
 */
export class WallClock {
  /** Set by `resolve`: the wall time fell in a gap and moved forward. */
  moved = false;
  /** Set by `resolve`: the wall time of the instant it gave, which differs when it `moved`. */
  resolvedWall = 0;
  readonly #timeZone: string;
  #offset = 0;
  #from = Number.POSITIVE_INFINITY;
  #until = Number.NEGATIVE_INFINITY;

  constructor(timeZone: string) {
    this.#timeZone = timeZone;
  }

  resolve(wall: number): number {
    const guess = wall - this.#offset;
    if (guess >= this.#from + MARGIN && guess < this.#until - MARGIN) {
      this.moved = false;
      this.resolvedWall = wall;
      return guess;
    }
    const zoned = toPlainDateTime(wall).toZonedDateTime(this.#timeZone, {
      disambiguation: "compatible",
    });
    const epoch = Math.floor(zoned.epochMilliseconds / 1000);
    const offset = zoned.offsetNanoseconds / 1e9;
    this.resolvedWall = epoch + offset;
    this.moved = this.resolvedWall !== wall;
    if (offset !== this.#offset || epoch < this.#from || epoch >= this.#until) this.#learn(zoned);
    return epoch;
  }

  /** Remembers the stretch of constant offset around `zoned`. */
  #learn(zoned: Temporal.ZonedDateTime): void {
    const next = zoned.getTimeZoneTransition("next");
    const previous = zoned.getTimeZoneTransition("previous");
    this.#offset = zoned.offsetNanoseconds / 1e9;
    this.#until = next === null ? Number.POSITIVE_INFINITY : next.epochMilliseconds / 1000;
    // At a change itself, "previous" is the change before, whose offset differs.
    this.#from =
      previous === null
        ? Number.NEGATIVE_INFINITY
        : previous.offsetNanoseconds === zoned.offsetNanoseconds
          ? previous.epochMilliseconds / 1000
          : zoned.epochMilliseconds / 1000;
  }
}

/**
 * How far wall times near `instant` can sit from its own wall time and still resolve to the
 * other side of it: the size of an offset change in the two days up to it, itself included. A time
 * in a gap that moved forward past `instant`, or a repeated time that resolved to its first
 * instant, is that far off at most.
 */
export function offsetChangeBefore(instant: Temporal.Instant, timeZone: string): number {
  const zoned = instant.toZonedDateTimeISO(timeZone);
  // "previous" leaves out a change at the instant itself.
  const previous = zoned.add({ nanoseconds: 1 }).getTimeZoneTransition("previous");
  if (previous === null || zoned.epochMilliseconds - previous.epochMilliseconds > MARGIN * 1000) {
    return 0;
  }
  const before = previous.subtract({ nanoseconds: 1 });
  return Math.ceil(Math.abs(previous.offsetNanoseconds - before.offsetNanoseconds) / 1e9);
}
