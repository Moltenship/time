import {
  timeGridZoneAxis,
  timeGridZoneTimes,
  type CalendarEnvironmentBase,
  type CalendarSecondaryTimeZone,
  type PlainDateInterval,
  type TimeGridColumn,
  type TimeGridZoneAxis,
  type TimeGridZoneShift,
} from "@moltenship/calendar";
import { useMemo, type CSSProperties } from "react";

import { cn } from "cn";

const noZones: readonly CalendarSecondaryTimeZone[] = Object.freeze([]);
const noGridZones: readonly TimeGridZone[] = Object.freeze([]);

/**
 * The gutter holds the display zone's hours, `--calendar-hours-width` wide (3rem, 4rem from `sm`),
 * and a column for each secondary zone, which `gutterStyle` counts. A zone's column is
 * `--calendar-zone-width` wide, 4rem by default: room for "12:30 AM+1". Set it, as a rem or px
 * length, on an element around the calendar for locales with longer times.
 */
export const timeGridGutterClassName =
  "[--calendar-hours-width:3rem] sm:[--calendar-hours-width:4rem] [--calendar-gutter-width:calc(var(--calendar-hours-width)+var(--calendar-zones,0)*var(--calendar-zone-width,4rem))]";

/** A secondary zone's column in the gutter; see `timeGridGutterClassName`. */
const zoneColumn = "w-[var(--calendar-zone-width,4rem)] shrink-0";

/** Widens the gutter by a column per secondary zone; see `timeGridGutterClassName`. */
export function gutterStyle(zones: readonly TimeGridZone[]): CSSProperties | undefined {
  return zones.length === 0 ? undefined : ({ "--calendar-zones": zones.length } as CSSProperties);
}

/** A day whose times in a secondary zone differ from the zone's hours beside the grid. */
export interface TimeGridZoneNote {
  readonly date: Temporal.PlainDate;
  /** Short, such as "EST -1h". */
  readonly text: string;
  /** The long form, for a tooltip. */
  readonly title: string;
}

/** A root's secondary time zone as the time grid draws it. */
export interface TimeGridZone {
  /** Its hour lines, read on the grid's first visible day without a clock change. */
  readonly axis: TimeGridZoneAxis;
  /** Over its hours: the zone's `label`, or its short name, such as "EDT" or "GMT+5:30". */
  readonly label: string;
  /** Its `label`, or its long name on the axis day, for the header's tooltip. */
  readonly name: string;
  /** Its `label`, or its long name at an instant, such as "Eastern Daylight Time". */
  readonly nameAt: (instant: Temporal.Instant) => string;
  /** The days whose times differ from its hours beside the grid. */
  readonly notes: readonly TimeGridZoneNote[];
  /** Its UTC offset at an instant, such as "GMT-4". */
  readonly offsetAt: (instant: Temporal.Instant) => string;
  readonly timeZone: string;
}

/** Reads a zone's name at an instant, in one of `Intl`'s styles. */
function zoneNamer(
  locale: Intl.LocalesArgument,
  timeZone: string,
  timeZoneName: "long" | "short" | "shortOffset",
) {
  const format = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName });
  return (instant: Temporal.Instant) =>
    format.formatToParts(instant).find(({ type }) => type === "timeZoneName")?.value ?? timeZone;
}

/** "1 PM" on the hour where the locale uses 12 hours, "1:30 PM" off it, and "13:00" otherwise. */
export function zoneTimeFormat(locale: Intl.LocalesArgument) {
  const hour = new Intl.DateTimeFormat(locale, { hour: "numeric" });
  const minute = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" });
  const { hourCycle } = hour.resolvedOptions();
  const twelveHour = hourCycle === "h11" || hourCycle === "h12";
  return (time: Temporal.PlainTime) =>
    (twelveHour && time.minute === 0 ? hour : minute).format(time);
}

/** "+1h" or "+30m" in the calendar's locale, and "1 hour" or "30 minutes" for English titles. */
function shiftFormats(locale: Intl.LocalesArgument) {
  const amount = (locales: Intl.LocalesArgument, unit: "hour" | "minute", narrow: boolean) =>
    new Intl.NumberFormat(locales, {
      signDisplay: narrow ? "always" : "never",
      style: "unit",
      unit,
      unitDisplay: narrow ? "narrow" : "long",
    });
  const formats = {
    long: { hour: amount("en", "hour", false), minute: amount("en", "minute", false) },
    narrow: { hour: amount(locale, "hour", true), minute: amount(locale, "minute", true) },
  };
  return {
    amount: (minutes: number, display: "long" | "narrow") =>
      minutes % 60 === 0
        ? formats[display].hour.format(minutes / 60)
        : formats[display].minute.format(minutes),
    time: new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }),
  };
}

/** Each date's runs, in column order. */
function runsByDate(shifts: readonly TimeGridZoneShift[]): readonly TimeGridZoneShift[][] {
  const byDate = new Map<string, TimeGridZoneShift[]>();
  for (const shift of shifts) {
    const key = shift.date.toString();
    byDate.set(key, [...(byDate.get(key) ?? []), shift]);
  }
  return [...byDate.values()];
}

/**
 * The root's secondary time zones over a grid's columns. Each zone's axis is read on the first of
 * the `visible` dates (all the columns by default) on which neither zone changes its clocks.
 */
export function useTimeGridZones(
  environment: CalendarEnvironmentBase,
  columns: readonly TimeGridColumn[],
  visible?: PlainDateInterval,
): readonly TimeGridZone[] {
  const { locale, secondaryTimeZones = noZones } = environment;
  return useMemo(() => {
    if (secondaryTimeZones.length === 0 || columns.length === 0) return noGridZones;
    const formats = shiftFormats(locale);
    const columnOn = (day: Temporal.PlainDate) =>
      columns.find((column) => column.date.equals(day)) ?? columns[0]!;

    return secondaryTimeZones.map(({ label: given, timeZone }) => {
      const axis = timeGridZoneAxis(columns, timeZone, { visible })!;
      // An empty label names nothing, so the zone keeps its own name.
      const label = given === "" ? undefined : given;
      const longName = zoneNamer(locale, axis.timeZone, "long");
      const shortName = zoneNamer(locale, axis.timeZone, "short");
      const nameAt = (instant: Temporal.Instant) => label ?? longName(instant);
      /** The moment a run starts, so it's named as the zone is by then, such as EST after EDT. */
      const startOf = ({ date, from }: TimeGridZoneShift) =>
        timeGridZoneTimes(columnOn(date), from, axis.timeZone)[0]?.instant ??
        columnOn(date).day.start;

      const notes = runsByDate(axis.shifts).map((runs) => {
        // The day's last run is how it reads from then on; the title has every run.
        const last = runs.at(-1)!;
        const titles = runs.map((run) => {
          const { from, minutes, until } = run;
          const span =
            until === null
              ? `From ${formats.time.format(from)}`
              : `From ${formats.time.format(from)} to ${formats.time.format(until)}`;
          const direction = minutes > 0 ? "later" : "earlier";
          return `${span}, times in ${nameAt(startOf(run))} are ${formats.amount(minutes, "long")} ${direction} than its hours beside the grid`;
        });
        return {
          date: last.date,
          text: `${label ?? shortName(startOf(last))} ${formats.amount(last.minutes, "narrow")}`,
          title: titles.join(". "),
        };
      });
      const axisStart = columnOn(axis.date).day.start;
      return {
        axis,
        label: label ?? shortName(axisStart),
        name: nameAt(axisStart),
        nameAt,
        notes,
        offsetAt: zoneNamer(locale, axis.timeZone, "shortOffset"),
        timeZone: axis.timeZone,
      };
    });
  }, [columns, locale, secondaryTimeZones, visible]);
}

/**
 * The column whose offset names the display zone over the gutter: the day the first secondary
 * zone's hours are read on, so the two agree, or `fallback` without zones. Each zone reads its own
 * day, so in the rare grid where those days fall either side of the display zone's clock change,
 * a later zone's hours follow the other offset; its notes say so.
 */
export function gutterColumn(
  columns: readonly TimeGridColumn[],
  zones: readonly TimeGridZone[],
  fallback: TimeGridColumn | undefined = columns[0],
): TimeGridColumn | undefined {
  const date = zones[0]?.axis.date;
  return (date && columns.find((column) => column.date.equals(date))) || fallback;
}

/** Rows label lines from 1:00 to 23:00, like the display zone's hours; midnight sits under the header. */
function labelledRows(axis: TimeGridZoneAxis) {
  return axis.rows.filter(({ top }) => top > 0);
}

/**
 * A secondary zone's hour labels on the display zone's lines, over the full height of the element
 * around them: its time at each line, with "+1" or "-1" where it's on another date. A skipped hour
 * has no label, and a repeated one shows its earlier time. Hidden from assistive technology like
 * the display zone's hours; focused slots name their time in each zone instead.
 */
export function TimeGridZoneHours({
  className,
  locale,
  zone,
}: {
  readonly className?: string;
  readonly locale: Intl.LocalesArgument;
  readonly zone: TimeGridZone;
}) {
  const formats = useMemo(
    () => ({
      day: new Intl.NumberFormat(locale, { signDisplay: "exceptZero" }),
      time: zoneTimeFormat(locale),
    }),
    [locale],
  );

  return (
    <div
      aria-hidden
      data-slot="time-grid-zone-hours"
      data-time-zone={zone.timeZone}
      className={cn("relative h-full", zoneColumn, className)}
    >
      {labelledRows(zone.axis).map(({ times, top }) => {
        const [time, repeat] = times;
        if (time === undefined) return null;
        const label = formats.time(time.dateTime.toPlainTime());
        return (
          <span
            key={top}
            className="absolute end-1 -translate-y-1/2 text-[0.625rem] whitespace-nowrap text-calendar-axis tabular-nums"
            style={{ top: `${top * 100}%` }}
            title={
              repeat === undefined
                ? undefined
                : `${label}, then ${formats.time(repeat.dateTime.toPlainTime())}`
            }
          >
            {label}
            {time.dayOffset !== 0 && (
              // Raised without `vertical-align`, so the label keeps its height and its line.
              <span data-day-offset="" className="relative -top-1 ms-px text-[0.5rem] leading-none">
                {formats.day.format(time.dayOffset)}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

/**
 * What a slot reads in each secondary zone, for its accessible name: "3:00 AM Eastern Standard
 * Time", with the weekday when it's another date there. Each time is named as its zone is at that
 * moment, so a repeated hour reads "1:30 AM British Summer Time or 1:30 AM Greenwich Mean Time";
 * `undefined` without zones.
 */
export function describeZoneTimes(
  column: TimeGridColumn,
  time: Temporal.PlainTime,
  zones: readonly TimeGridZone[],
  formats: { readonly dayTime: Intl.DateTimeFormat; readonly time: Intl.DateTimeFormat },
): string | undefined {
  const parts = zones.flatMap((zone) => {
    const read = timeGridZoneTimes(column, time, zone.timeZone).map(
      ({ dateTime, dayOffset, instant }) => ({
        name: zone.nameAt(instant),
        offset: zone.offsetAt(instant),
        time:
          dayOffset === 0
            ? formats.time.format(dateTime.toPlainTime())
            : formats.dayTime.format(dateTime),
      }),
    );
    const [first] = read;
    if (first === undefined) return [];
    const oneName = read.every(({ name }) => name === first.name);
    const oneTime = read.length > 1 && read.every(({ time: other }) => other === first.time);
    if (oneName && !oneTime)
      return [`${read.map(({ time: at }) => at).join(" or ")} ${first.name}`];
    // Different names tell the times apart; under one label, so does the offset.
    return [
      read
        .map(({ name, offset, time: at }) =>
          oneName ? `${at} ${name} ${offset}` : `${at} ${name}`,
        )
        .join(" or "),
    ];
  });
  return parts.length === 0 ? undefined : parts.join(", ");
}

/**
 * The gutter's header labels: each secondary zone's name over its hours, then the display zone's
 * offset over its own. Zone names are hidden from assistive technology, like their hours.
 */
export function TimeGridGutterLabels({
  offset,
  zones,
}: {
  /** The display zone's offset, such as "GMT+2". */
  readonly offset: string | undefined;
  readonly zones: readonly TimeGridZone[];
}) {
  return (
    <>
      {zones.map((zone, index) => (
        <span
          key={index}
          aria-hidden
          data-slot="time-grid-zone-label"
          className={cn("truncate pe-1 text-end", zoneColumn)}
          title={zone.name}
        >
          {zone.label}
        </span>
      ))}
      {/* A flex container, so an offset too long for the hours overflows outward, not into the days. */}
      <span className="flex min-w-0 flex-1 justify-end pe-2 whitespace-nowrap">{offset}</span>
    </>
  );
}

/** Each date's notes across the zones, by its ISO date. */
export function zoneNotesByDate(
  zones: readonly TimeGridZone[],
): ReadonlyMap<string, readonly TimeGridZoneNote[]> {
  const byDate = new Map<string, TimeGridZoneNote[]>();
  for (const { notes } of zones) {
    for (const note of notes) {
      const key = note.date.toString();
      byDate.set(key, [...(byDate.get(key) ?? []), note]);
    }
  }
  return byDate;
}

/** A day's notes under its date, where its times in a secondary zone differ from the gutter's. */
export function TimeGridZoneNotes({
  className,
  notes,
}: {
  readonly className?: string;
  readonly notes: readonly TimeGridZoneNote[] | undefined;
}) {
  if (notes === undefined || notes.length === 0) return null;
  return (
    <span
      aria-hidden
      data-slot="time-grid-zone-note"
      className={cn(
        "flex max-w-full min-w-0 flex-col text-[0.5625rem] leading-tight whitespace-nowrap text-muted-foreground",
        className,
      )}
    >
      {notes.map((note, index) => (
        <span key={index} className="max-w-full truncate" title={note.title}>
          {note.text}
        </span>
      ))}
    </span>
  );
}
