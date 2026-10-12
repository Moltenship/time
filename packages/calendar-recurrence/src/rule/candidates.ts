import {
  civilDate,
  epochDay,
  floorDiv,
  LAST_DAY,
  monthLength,
  SECONDS_PER_DAY,
  weekday,
  yearLength,
} from "./calendar";
import { Frequency, type CompiledRule } from "./compile";

/** `Candidates.next` result for a step that found nothing. */
export const NOTHING = Number.NEGATIVE_INFINITY;
/** `Candidates.next` result once the calendar runs out. */
export const END = Number.POSITIVE_INFINITY;

const SECONDS_PER_UNIT: Readonly<Record<Frequency, number>> = {
  [Frequency.Yearly]: 0,
  [Frequency.Monthly]: 0,
  [Frequency.Weekly]: 0,
  [Frequency.Daily]: SECONDS_PER_DAY,
  [Frequency.Hourly]: 3600,
  [Frequency.Minutely]: 60,
  [Frequency.Secondly]: 1,
};

/** An epoch day that falls on `weekStart`, counting from Thursday 1970-01-01. */
const weekAnchor = (weekStart: number) => weekStart - 4;

/** The first listed value from `from` on, or `size` when none is. */
function listedFrom(listed: readonly boolean[], from: number, size: number): number {
  for (let value = from; value < size; value += 1) if (listed[value]) return value;
  return size;
}

/** Which period of `frequency` a wall time falls in, counting from 1970. */
export function periodOf(rule: CompiledRule, wall: number): number {
  const day = floorDiv(wall, SECONDS_PER_DAY);
  switch (rule.frequency) {
    case Frequency.Yearly:
      return civilDate(day).year;
    case Frequency.Monthly: {
      const { month, year } = civilDate(day);
      return year * 12 + month - 1;
    }
    case Frequency.Weekly:
      return floorDiv(day - weekAnchor(rule.weekStart), 7);
    default:
      return floorDiv(wall, SECONDS_PER_UNIT[rule.frequency]);
  }
}

/**
 * The wall-time starts a rule gives, period by period, in ascending order within each period and
 * from one period to the next. Each period's dates come from the BY parts as RFC 5545 §3.3.10's
 * table says: YEARLY, MONTHLY and WEEKLY take every day of the period that passes the day parts,
 * which expands them, while shorter periods are kept or dropped whole. Dates no calendar has, such
 * as 30 February, are never made, so they are skipped rather than clamped. BYSETPOS then picks from
 * the period's sorted set.
 */
export class Candidates {
  /** Wall seconds where the period of the latest step starts; nothing later in it is earlier. */
  periodStart = 0;
  readonly #rule: CompiledRule;
  readonly #origin: number;
  #period: number;
  /** Bases in wall seconds, each paired with every `times` offset, unless `#picked` is set. */
  #bases: number[] = [];
  #picked: number[] | undefined;
  #base = 0;
  #time = 0;
  readonly #weekOne = new Map<number, number>();

  /**
   * @param origin The period of the first occurrence; periods repeat every INTERVAL from it.
   * @param period The period to start at, `origin` or a later one INTERVAL apart.
   */
  constructor(rule: CompiledRule, origin: number, period: number) {
    this.#rule = rule;
    this.#origin = origin;
    this.#period = period;
  }

  /** The next start in wall seconds, `NOTHING` for a step that found none, or `END`. */
  next(): number {
    if (this.#rule.impossible) return END;
    if (this.#picked !== undefined) {
      if (this.#base < this.#picked.length) return this.#picked[this.#base++]!;
    } else if (this.#base < this.#bases.length) {
      const wall = this.#bases[this.#base]! + this.#rule.times[this.#time]!;
      this.#time += 1;
      if (this.#time === this.#rule.times.length) {
        this.#time = 0;
        this.#base += 1;
      }
      return wall;
    }
    if (!this.#fill()) return END;
    const found = this.#picked?.length ?? this.#bases.length * this.#rule.times.length;
    return found === 0 ? NOTHING : this.next();
  }

  /** Steps to the next period and collects its bases. False past the last day. */
  #fill(): boolean {
    const rule = this.#rule;
    const period = this.#period;
    this.#bases = [];
    this.#picked = undefined;
    this.#base = 0;
    this.#time = 0;
    this.#period += rule.interval;

    switch (rule.frequency) {
      case Frequency.Yearly: {
        const first = epochDay(period, 1, 1);
        if (first > LAST_DAY) return false;
        this.periodStart = first * SECONDS_PER_DAY;
        const ordinals =
          rule.ordinalWeekdays &&
          (rule.months
            ? this.#ordinals(
                rule.months.flatMap((listed, month) =>
                  listed ? [[epochDay(period, month, 1), monthLength(period, month)]] : [],
                ),
              )
            : this.#ordinals([[first, yearLength(period)]]));
        for (let month = 1; month <= 12; month += 1) {
          if (rule.months && !rule.months[month]) continue;
          this.#collectDays(epochDay(period, month, 1), monthLength(period, month), ordinals);
        }
        break;
      }
      case Frequency.Monthly: {
        const year = floorDiv(period, 12);
        const month = period - year * 12 + 1;
        const first = epochDay(year, month, 1);
        if (first > LAST_DAY) return false;
        this.periodStart = first * SECONDS_PER_DAY;
        if (rule.months && !rule.months[month]) break;
        const length = monthLength(year, month);
        const ordinals = rule.ordinalWeekdays && this.#ordinals([[first, length]]);
        this.#collectDays(first, length, ordinals);
        break;
      }
      case Frequency.Weekly: {
        const first = period * 7 + weekAnchor(rule.weekStart);
        if (first > LAST_DAY) return false;
        this.periodStart = first * SECONDS_PER_DAY;
        this.#collectDays(first, 7, undefined);
        break;
      }
      case Frequency.Daily: {
        if (period > LAST_DAY) return false;
        this.periodStart = period * SECONDS_PER_DAY;
        const { month, year } = civilDate(period);
        if (rule.months && !rule.months[month]) {
          // Skip the rest of a month BYMONTH leaves out.
          this.#skipTo(epochDay(year, month, 1) + monthLength(year, month));
          break;
        }
        this.#collectDays(period, 1, undefined);
        break;
      }
      default:
        if (!this.#fillSubDaily(period)) return false;
    }

    // Every listed second can be 60, which no clock shows.
    if (rule.times.length === 0) this.#bases = [];
    if (rule.setPositions !== undefined) this.#pick(rule.setPositions);
    return true;
  }

  /**
   * HOURLY, MINUTELY and SECONDLY: a period is kept or dropped whole by the day, BYHOUR, BYMINUTE
   * and BYSECOND. One that fails skips to the next day, hour, minute or second that could pass, so
   * the periods in between are never visited.
   */
  #fillSubDaily(period: number): boolean {
    const rule = this.#rule;
    const unit = SECONDS_PER_UNIT[rule.frequency];
    const start = period * unit;
    const day = floorDiv(start, SECONDS_PER_DAY);
    if (day > LAST_DAY) return false;
    this.periodStart = start;
    const dayStart = day * SECONDS_PER_DAY;
    const ofDay = start - dayStart;
    const hour = floorDiv(ofDay, 3600);
    const minute = floorDiv(ofDay % 3600, 60);
    const second = ofDay % 60;
    // Where the next time that could pass starts, in wall seconds.
    let next: number | undefined;
    if (!this.#matchesDay(day, undefined)) {
      next = dayStart + SECONDS_PER_DAY;
    } else if (rule.hours && !rule.hours[hour]) {
      next = dayStart + listedFrom(rule.hours, hour + 1, 24) * 3600;
    } else if (rule.minutes && !rule.minutes[minute]) {
      next = start - minute * 60 - second + listedFrom(rule.minutes, minute + 1, 60) * 60;
    } else if (rule.seconds && !rule.seconds[second]) {
      next = start - second + listedFrom(rule.seconds, second + 1, 60);
    }
    if (next === undefined) this.#bases.push(start);
    else this.#skipTo(floorDiv(next, unit));
    return true;
  }

  /** Moves the next period to the first one at or after `period` that INTERVAL reaches. */
  #skipTo(period: number): void {
    const { interval } = this.#rule;
    const reached = this.#origin + Math.ceil((period - this.#origin) / interval) * interval;
    this.#period = Math.max(this.#period, reached);
  }

  #collectDays(first: number, length: number, ordinals: ReadonlySet<number> | undefined): void {
    for (let day = first; day < first + length; day += 1) {
      if (day <= LAST_DAY && this.#matchesDay(day, ordinals)) {
        this.#bases.push(day * SECONDS_PER_DAY);
      }
    }
  }

  /** The days that BYDAY ordinals pick in each range of `[first day, length]`. */
  #ordinals(ranges: readonly (readonly [number, number])[]): Set<number> {
    const days = new Set<number>();
    for (const [first, length] of ranges) {
      const last = first + length - 1;
      for (const { ordinal, weekday: day } of this.#rule.ordinalWeekdays ?? []) {
        const pick =
          ordinal > 0
            ? first + ((day - weekday(first) + 7) % 7) + (ordinal - 1) * 7
            : last - ((weekday(last) - day + 7) % 7) + (ordinal + 1) * 7;
        if (pick >= first && pick <= last) days.add(pick);
      }
    }
    return days;
  }

  /** Whether a day passes BYMONTH, BYMONTHDAY, BYYEARDAY, BYWEEKNO and BYDAY. */
  #matchesDay(day: number, ordinals: ReadonlySet<number> | undefined): boolean {
    const rule = this.#rule;
    const { day: dayOfMonth, month, year } = civilDate(day);
    if (rule.months && !rule.months[month]) return false;
    if (rule.monthDays) {
      const fromEnd = dayOfMonth - monthLength(year, month) - 1;
      if (!rule.monthDays.has(dayOfMonth) && !rule.monthDays.has(fromEnd)) return false;
    }
    if (rule.yearDays) {
      const dayOfYear = day - epochDay(year, 1, 1) + 1;
      const fromEnd = dayOfYear - yearLength(year) - 1;
      if (!rule.yearDays.has(dayOfYear) && !rule.yearDays.has(fromEnd)) return false;
    }
    if (rule.weekNumbers && !this.#inWeeks(day, year, rule.weekNumbers)) return false;
    if (rule.weekdays || rule.ordinalWeekdays) {
      if (!rule.weekdays?.[weekday(day)] && !ordinals?.has(day)) return false;
    }
    return true;
  }

  /**
   * BYWEEKNO, with weeks starting on WKST and week 1 the first with at least four days of its year
   * (RFC 5545 §3.3.10). A day belongs to the week-numbering year its week does, so late December
   * can be week 1 of the next year and early January the last week of the one before.
   */
  #inWeeks(day: number, year: number, weeks: ReadonlySet<number>): boolean {
    let weekYear = year;
    if (day < this.#weekOneStart(year)) weekYear -= 1;
    else if (day >= this.#weekOneStart(year + 1)) weekYear += 1;
    const start = this.#weekOneStart(weekYear);
    const number = floorDiv(day - start, 7) + 1;
    const total = (this.#weekOneStart(weekYear + 1) - start) / 7;
    return weeks.has(number) || weeks.has(number - total - 1);
  }

  /** The first day of week 1: the week, starting on WKST, that holds 4 January. */
  #weekOneStart(year: number): number {
    let start = this.#weekOne.get(year);
    if (start === undefined) {
      const fourth = epochDay(year, 1, 4);
      start = fourth - ((weekday(fourth) - this.#rule.weekStart + 7) % 7);
      this.#weekOne.set(year, start);
    }
    return start;
  }

  /** BYSETPOS: the listed positions of the period's sorted set, counting from the end when negative. */
  #pick(positions: readonly number[]): void {
    const { times } = this.#rule;
    const size = this.#bases.length * times.length;
    const picked = new Set<number>();
    for (const position of positions) {
      const index = position > 0 ? position - 1 : size + position;
      if (index >= 0 && index < size) {
        picked.add(this.#bases[floorDiv(index, times.length)]! + times[index % times.length]!);
      }
    }
    this.#picked = [...picked].sort((left, right) => left - right);
  }
}
