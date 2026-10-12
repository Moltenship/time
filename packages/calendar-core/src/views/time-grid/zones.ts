import { resolveZonedWallTime } from "@moltenship/calendar-temporal";

import type { CalendarSecondaryTimeZone } from "../../environment";
import type { TimeGridColumn } from "./columns";

const DAY_MINUTES = 24 * 60;
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

/** A column whose lines read differently in the other zone from the axis's. */
export interface TimeGridZoneShift {
  readonly date: Temporal.PlainDate;
  /** The first line that reads differently. */
  readonly from: Temporal.PlainTime;
  /** How many minutes later that line reads than the axis's; negative when it reads earlier. */
  readonly minutes: number;
}

/**
 * A time grid's hour lines in another zone. A grid has one hour gutter for all its columns, so the
 * axis reads its rows on one date; the other columns whose lines read differently, such as after a
 * DST change in either zone, are its shifts.
 */
export interface TimeGridZoneAxis {
  /** The date the rows were read on. */
  readonly date: Temporal.PlainDate;
  readonly rows: readonly TimeGridZoneRow[];
  /** The other columns whose lines read differently, in column order. */
  readonly shifts: readonly TimeGridZoneShift[];
  /** The other zone, as Temporal names it. */
  readonly timeZone: string;
}

export interface TimeGridZoneAxisOptions {
  /** The column the rows are read on; the first column when absent or not among the columns. */
  readonly date?: Temporal.PlainDate;
  /** Minutes between lines, which must divide a day; 60 by default. */
  readonly step?: number;
}

/** Why `resolveSecondaryTimeZones` left an entry out. */
export interface SecondaryTimeZoneIssue {
  readonly code: "invalid-secondary-time-zone";
  /** The entry's position in the list it was given. */
  readonly index: number;
  readonly value: unknown;
}

export interface ResolvedSecondaryTimeZones {
  readonly issues: readonly SecondaryTimeZoneIssue[];
  /** The valid entries in order, each zone as Temporal names it. */
  readonly zones: readonly CalendarSecondaryTimeZone[];
}

/** The zone as Temporal names it, or `null` when Temporal doesn't know it. */
function canonicalTimeZone(value: string): string | null {
  try {
    return Temporal.Instant.fromEpochNanoseconds(0n).toZonedDateTimeISO(value).timeZoneId;
  } catch {
    return null;
  }
}

/**
 * Reads a list of secondary time zones, each an IANA name or `{ timeZone, label }`. Unknown zones
 * and malformed entries are left out and reported, so a bad setting never breaks the calendar.
 */
export function resolveSecondaryTimeZones(
  input: readonly (CalendarSecondaryTimeZone | string)[],
): ResolvedSecondaryTimeZones {
  const zones: CalendarSecondaryTimeZone[] = [];
  const issues: SecondaryTimeZoneIssue[] = [];

  input.forEach((value, index) => {
    const entry: Partial<CalendarSecondaryTimeZone> | null =
      typeof value === "string"
        ? { timeZone: value }
        : typeof value === "object" && value !== null
          ? value
          : null;
    const label = entry?.label;
    const timeZone =
      typeof entry?.timeZone === "string" && (label === undefined || typeof label === "string")
        ? canonicalTimeZone(entry.timeZone)
        : null;
    if (timeZone === null) {
      issues.push(Object.freeze({ code: "invalid-secondary-time-zone", index, value }));
      return;
    }
    zones.push(Object.freeze(label === undefined ? { timeZone } : { label, timeZone }));
  });

  return Object.freeze({ issues: Object.freeze(issues), zones: Object.freeze(zones) });
}

/**
 * A display-zone wall time on a column's date, read in another zone: one time for each moment
 * the wall time occurs. Each moment comes from Temporal's own rules for both zones on that date,
 * never from a fixed offset between them.
 */
export function timeGridZoneTimes(
  column: TimeGridColumn,
  wallTime: Temporal.PlainTime,
  timeZone: string,
): readonly TimeGridZoneTime[] {
  const { occurrences } = resolveZonedWallTime(column.date.toPlainDateTime(wallTime), {
    disambiguation: "reject",
    timeZone: column.day.timeZone,
  });
  if (occurrences.length === 0) return noTimes;

  return Object.freeze(
    occurrences.map(({ instant }) => {
      const zoned = instant.toZonedDateTimeISO(timeZone);
      return Object.freeze({
        dateTime: zoned.toPlainDateTime(),
        dayOffset: column.date.until(zoned.toPlainDate()).days,
        instant,
        offset: zoned.offset,
      });
    }),
  );
}

function validStep(step: number): number {
  if (!Number.isInteger(step) || step < 1 || DAY_MINUTES % step !== 0) {
    throw new RangeError("invalid-time-grid-zone-step");
  }
  return step;
}

/** A column's lines every `step` minutes from midnight, each read in another zone on its own. */
export function timeGridZoneRows(
  column: TimeGridColumn,
  timeZone: string,
  step = 60,
): readonly TimeGridZoneRow[] {
  const increment = validStep(step);
  const rows: TimeGridZoneRow[] = [];
  for (let minutes = 0; minutes < DAY_MINUTES; minutes += increment) {
    const wallTime = new Temporal.PlainTime(Math.floor(minutes / 60), minutes % 60);
    rows.push(
      Object.freeze({
        times: timeGridZoneTimes(column, wallTime, timeZone),
        top: minutes / DAY_MINUTES,
        wallTime,
      }),
    );
  }
  return Object.freeze(rows);
}

/**
 * Minutes from a line's wall time on its column's date to its first time in the other zone. Two
 * lines read the same, date marker included, when they lead by the same minutes.
 */
function lead(row: TimeGridZoneRow, date: Temporal.PlainDate): number | null {
  const time = row.times[0];
  if (time === undefined) return null;
  const wall = date.toPlainDateTime(row.wallTime);
  return wall.until(time.dateTime, { largestUnit: "hour" }).total({ unit: "minute" });
}

/** Where `rows` read differently from the axis's, skipping lines either side skips. */
function shiftOf(
  date: Temporal.PlainDate,
  rows: readonly TimeGridZoneRow[],
  axisDate: Temporal.PlainDate,
  axisRows: readonly TimeGridZoneRow[],
): TimeGridZoneShift | null {
  for (const [index, row] of rows.entries()) {
    const axisRow = axisRows[index];
    const own = lead(row, date);
    const axis = axisRow === undefined ? null : lead(axisRow, axisDate);
    if (own !== null && axis !== null && own !== axis) {
      return Object.freeze({ date, from: row.wallTime, minutes: own - axis });
    }
  }
  return null;
}

/**
 * The grid's hour lines in another zone, read on one column's date, and the other columns that
 * read differently. `null` without columns. Throws a `RangeError` for an unknown zone.
 */
export function timeGridZoneAxis(
  columns: readonly TimeGridColumn[],
  timeZone: string,
  options: TimeGridZoneAxisOptions = {},
): TimeGridZoneAxis | null {
  const { date, step = 60 } = options;
  const zone = canonicalTimeZone(timeZone);
  if (zone === null) throw new RangeError("invalid-time-zone");
  const axisColumn =
    (date === undefined ? undefined : columns.find((column) => column.date.equals(date))) ??
    columns[0];
  if (axisColumn === undefined) return null;
  const rows = timeGridZoneRows(axisColumn, zone, step);
  const shifts: TimeGridZoneShift[] = [];
  for (const column of columns) {
    if (column === axisColumn) continue;
    const shift = shiftOf(column.date, timeGridZoneRows(column, zone, step), axisColumn.date, rows);
    if (shift !== null) shifts.push(shift);
  }

  return Object.freeze({
    date: axisColumn.date,
    rows,
    shifts: Object.freeze(shifts),
    timeZone: zone,
  });
}
