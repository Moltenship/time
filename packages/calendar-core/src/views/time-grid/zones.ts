import { plainDateIntervalContains, type PlainDateInterval } from "@moltenship/calendar-temporal";

import type { CalendarSecondaryTimeZone } from "../../environment";
import { timeZoneIdOf } from "../../internal/time-zone-id";
import type { TimeGridColumn } from "./columns";

const DAY_MINUTES = 24 * 60;
const MINUTE_NANOSECONDS = 60_000_000_000;
const noTimes: readonly TimeGridZoneTime[] = Object.freeze([]);

/** A display-zone wall time read in another zone. */
export interface TimeGridZoneTime {
  /** The wall time in the other zone. */
  readonly dateTime: Temporal.PlainDateTime;
  /** Days from the column's date to the other zone's date: `1` when it's already the next day there. */
  readonly dayOffset: number;
  /** The moment the display zone's wall time resolves to. */
  readonly instant: Temporal.Instant;
  /** The other zone's UTC offset at that moment, such as `"+05:30"`. */
  readonly offset: string;
}

/** A line across a column's nominal 24-hour axis, read in another zone. */
export interface TimeGridZoneRow {
  /**
   * The line's times in the other zone: none where the display zone skips its wall time (spring
   * forward), and two, earlier first, where it repeats it (fall back).
   */
  readonly times: readonly TimeGridZoneTime[];
  /** Position on the axis, from 0 at midnight to 1 at the next midnight. */
  readonly top: number;
  /** The display zone's wall time at the line. */
  readonly wallTime: Temporal.PlainTime;
}

/**
 * A run of lines on one column that read differently in the other zone from the axis's lines.
 * Lines compare by their first time, the one a gutter shows; a line either side skips neither
 * starts nor ends a run.
 */
export interface TimeGridZoneShift {
  readonly date: Temporal.PlainDate;
  /** The run's first line. */
  readonly from: Temporal.PlainTime;
  /**
   * How many minutes later the run's lines read than the axis's; negative when they read
   * earlier. Historical offsets with seconds in them make it fractional.
   */
  readonly minutes: number;
  /** The first line after the run, or `null` when the run lasts to the end of the date. */
  readonly until: Temporal.PlainTime | null;
}

/**
 * A time grid's hour lines in another zone. A grid has one hour gutter for all its columns, so the
 * axis reads its rows on one column; the runs of lines on other columns that read differently,
 * such as after a DST change in either zone, are its shifts.
 */
export interface TimeGridZoneAxis {
  /** The date the rows were read on. */
  readonly date: Temporal.PlainDate;
  readonly rows: readonly TimeGridZoneRow[];
  /** The runs of lines on other columns that read differently, in column and line order. */
  readonly shifts: readonly TimeGridZoneShift[];
  /** The other zone, as Temporal spells it. */
  readonly timeZone: string;
}

export interface TimeGridZoneAxisOptions {
  /** Minutes between lines, which must divide a day; 60 by default. */
  readonly step?: number;
  /**
   * The dates on screen, when the grid renders columns beside them, as the scrolling views do;
   * all the columns by default, or when no column is on them. The axis is read on the first of
   * them where neither zone changes its clocks, or else on the first that isn't a skipped date.
   */
  readonly visible?: PlainDateInterval;
}

/** Why `resolveSecondaryTimeZones` left an entry out. */
export interface SecondaryTimeZoneIssue {
  readonly code: "invalid-secondary-time-zone";
  /** The entry's position in the list; absent when the value isn't a list. */
  readonly index?: number;
  readonly value: unknown;
}

export interface ResolvedSecondaryTimeZones {
  readonly issues: readonly SecondaryTimeZoneIssue[];
  /** The valid entries in order, each zone as Temporal spells it. */
  readonly zones: readonly CalendarSecondaryTimeZone[];
}

/**
 * Reads a list of secondary time zones, each an IANA name or `{ timeZone, label }`. Unknown zones,
 * malformed entries and a value that isn't a list are left out and reported, so a bad setting
 * never breaks the calendar. Duplicates are kept.
 */
export function resolveSecondaryTimeZones(input: unknown): ResolvedSecondaryTimeZones {
  const zones: CalendarSecondaryTimeZone[] = [];
  const issues: SecondaryTimeZoneIssue[] = [];
  if (!Array.isArray(input)) {
    issues.push(Object.freeze({ code: "invalid-secondary-time-zone", value: input }));
    return Object.freeze({ issues: Object.freeze(issues), zones: Object.freeze(zones) });
  }

  // `Array.from` turns holes into `undefined`, which `forEach` would skip.
  Array.from(input as readonly unknown[]).forEach((value, index) => {
    const entry =
      typeof value === "string"
        ? { timeZone: value }
        : typeof value === "object" && value !== null
          ? (value as Partial<CalendarSecondaryTimeZone>)
          : null;
    const label = entry?.label;
    const timeZone =
      label === undefined || typeof label === "string" ? timeZoneIdOf(entry?.timeZone) : null;
    if (timeZone === null) {
      issues.push(Object.freeze({ code: "invalid-secondary-time-zone", index, value }));
      return;
    }
    zones.push(Object.freeze(label === undefined ? { timeZone } : { label, timeZone }));
  });

  return Object.freeze({ issues: Object.freeze(issues), zones: Object.freeze(zones) });
}

function zoneOrThrow(timeZone: string): string {
  const id = timeZoneIdOf(timeZone);
  if (id === null) throw new RangeError("invalid-time-zone");
  return id;
}

/** A line's times, and how far its first one's wall clock leads the display zone's, in ns. */
interface Line {
  readonly lead: number | null;
  readonly times: readonly TimeGridZoneTime[];
}

/**
 * Reads a wall time on a column's date in another zone. Its moments are the instants that round
 * trip to it in the display zone (ADR 0016): none in a gap, two in a fold.
 */
function readLine(column: TimeGridColumn, wallTime: Temporal.PlainTime, timeZone: string): Line {
  const wall = column.date.toPlainDateTime(wallTime);
  const displayZone = column.day.timeZone;
  const earlier = wall.toZonedDateTime(displayZone, { disambiguation: "earlier" });
  const later = wall.toZonedDateTime(displayZone, { disambiguation: "later" });
  const moments = [earlier, later].filter(
    (moment, index) =>
      moment.toPlainDateTime().equals(wall) &&
      (index === 0 || moment.epochNanoseconds !== earlier.epochNanoseconds),
  );
  if (moments.length === 0) return { lead: null, times: noTimes };

  const there = moments.map((moment) => moment.withTimeZone(timeZone));
  return {
    lead: there[0]!.offsetNanoseconds - moments[0]!.offsetNanoseconds,
    times: Object.freeze(
      there.map((zoned) =>
        Object.freeze({
          dateTime: zoned.toPlainDateTime(),
          dayOffset: column.date.until(zoned.toPlainDate()).days,
          instant: zoned.toInstant(),
          offset: zoned.offset,
        }),
      ),
    ),
  };
}

/**
 * A display-zone wall time on a column's date, read in another zone: one time for each moment
 * the wall time occurs. Each moment comes from Temporal's own rules for both zones on that date,
 * never from a fixed offset between them. Throws a `RangeError` for an unknown zone.
 */
export function timeGridZoneTimes(
  column: TimeGridColumn,
  wallTime: Temporal.PlainTime,
  timeZone: string,
): readonly TimeGridZoneTime[] {
  return readLine(column, wallTime, zoneOrThrow(timeZone)).times;
}

function validStep(step: number): number {
  if (!Number.isInteger(step) || step < 1 || DAY_MINUTES % step !== 0) {
    throw new RangeError("invalid-time-grid-zone-step");
  }
  return step;
}

function wallTimes(step: number): readonly Temporal.PlainTime[] {
  const increment = validStep(step);
  const times: Temporal.PlainTime[] = [];
  for (let minutes = 0; minutes < DAY_MINUTES; minutes += increment) {
    times.push(new Temporal.PlainTime(Math.floor(minutes / 60), minutes % 60));
  }
  return times;
}

function rowsOf(
  column: TimeGridColumn,
  times: readonly Temporal.PlainTime[],
  timeZone: string,
): { readonly lines: readonly Line[]; readonly rows: readonly TimeGridZoneRow[] } {
  const lines = times.map((wallTime) => readLine(column, wallTime, timeZone));
  const rows = times.map((wallTime, index) =>
    Object.freeze({
      times: lines[index]!.times,
      top: (wallTime.hour * 60 + wallTime.minute) / DAY_MINUTES,
      wallTime,
    }),
  );
  return { lines, rows: Object.freeze(rows) };
}

/**
 * A column's lines every `step` minutes from midnight, each read in another zone on its own.
 * Throws a `RangeError` for an unknown zone or a step that doesn't divide a day.
 */
export function timeGridZoneRows(
  column: TimeGridColumn,
  timeZone: string,
  step = 60,
): readonly TimeGridZoneRow[] {
  return rowsOf(column, wallTimes(step), zoneOrThrow(timeZone)).rows;
}

/** Whether neither zone changes its clocks during the column's date. */
function steady(column: TimeGridColumn, timeZone: string): boolean {
  const { day, folds, gaps } = column;
  if (day.interval === null || folds.length > 0 || gaps.length > 0) return false;
  return [day.timeZone, timeZone].every((zone) => {
    const next = day.startBoundary.withTimeZone(zone).getTimeZoneTransition("next");
    return next === null || next.epochNanoseconds >= day.end.epochNanoseconds;
  });
}

/** How far the other zone's wall clock leads the display zone's through a steady column, in ns. */
function steadyLead(column: TimeGridColumn, timeZone: string): number {
  const start = column.day.startBoundary;
  return start.withTimeZone(timeZone).offsetNanoseconds - start.offsetNanoseconds;
}

/** The runs of `lines` that lead differently from the axis's, skipping lines either side skips. */
function shiftsOf(
  date: Temporal.PlainDate,
  times: readonly Temporal.PlainTime[],
  lines: readonly Line[],
  axis: readonly Line[],
): readonly TimeGridZoneShift[] {
  const shifts: TimeGridZoneShift[] = [];
  let run: { readonly from: Temporal.PlainTime; readonly minutes: number } | null = null;
  const end = (until: Temporal.PlainTime | null) => {
    if (run !== null) shifts.push(Object.freeze({ date, ...run, until }));
    run = null;
  };

  for (const [index, line] of lines.entries()) {
    const axisLead = axis[index]?.lead ?? null;
    if (line.lead === null || axisLead === null) continue;
    const minutes = (line.lead - axisLead) / MINUTE_NANOSECONDS;
    if (run !== null && run.minutes !== minutes) end(times[index]!);
    if (run === null && minutes !== 0) run = { from: times[index]!, minutes };
  }
  end(null);
  return shifts;
}

/**
 * The grid's hour lines in another zone, read on one column, and the runs of lines on the other
 * columns that read differently. `null` without columns. Throws a `RangeError` for an unknown
 * zone or a step that doesn't divide a day.
 */
export function timeGridZoneAxis(
  columns: readonly TimeGridColumn[],
  timeZone: string,
  options: TimeGridZoneAxisOptions = {},
): TimeGridZoneAxis | null {
  const { step = 60, visible } = options;
  const zone = zoneOrThrow(timeZone);
  const times = wallTimes(step);
  const shown =
    visible === undefined
      ? columns
      : columns.filter((column) => plainDateIntervalContains(visible, column.date));
  const candidates = shown.length > 0 ? shown : columns;
  const axisColumn =
    candidates.find((column) => steady(column, zone)) ??
    candidates.find((column) => column.day.interval !== null) ??
    candidates[0];
  if (axisColumn === undefined) return null;

  const axis = rowsOf(axisColumn, times, zone);
  const axisSteady = steady(axisColumn, zone);
  const shifts: TimeGridZoneShift[] = [];
  for (const column of columns) {
    if (column === axisColumn) continue;
    // Two steady dates read alike line by line, or differ on every line by the same amount.
    if (axisSteady && steady(column, zone)) {
      const minutes =
        (steadyLead(column, zone) - steadyLead(axisColumn, zone)) / MINUTE_NANOSECONDS;
      if (minutes !== 0) {
        shifts.push(Object.freeze({ date: column.date, from: times[0]!, minutes, until: null }));
      }
      continue;
    }
    shifts.push(...shiftsOf(column.date, times, rowsOf(column, times, zone).lines, axis.lines));
  }

  return Object.freeze({
    date: axisColumn.date,
    rows: axis.rows,
    shifts: Object.freeze(shifts),
    timeZone: zone,
  });
}
