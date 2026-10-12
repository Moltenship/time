import {
  timeGridZoneAxis,
  timeGridZoneTimes,
  type CalendarEnvironmentBase,
  type CalendarSecondaryTimeZone,
  type TimeGridColumn,
  type PlainDateInterval,
  type TimeGridZoneAxis,
  type TimeGridZoneShift,
} from "@moltenship/calendar";
import { useMemo, type CSSProperties } from "react";

import { cn } from "cn";

const noZones: readonly CalendarSecondaryTimeZone[] = Object.freeze([]);
const noGridZones: readonly TimeGridZone[] = Object.freeze([]);

/**
 * The gutter holds the display zone's hours, `--calendar-hours-width` wide (3rem, 4rem from `sm`),
 * and a `--calendar-zone-width` column (4rem, room for "12:30 AM+1") for each secondary zone,
 * which `gutterStyle` counts.
 */
export const timeGridGutterClassName =
  "[--calendar-hours-width:3rem] [--calendar-zone-width:4rem] sm:[--calendar-hours-width:4rem] [--calendar-gutter-width:calc(var(--calendar-hours-width)+var(--calendar-zones,0)*var(--calendar-zone-width))]";

/** Widens the gutter by a column per secondary zone; see `timeGridGutterClassName`. */
export function gutterStyle(zones: readonly TimeGridZone[]): CSSProperties | undefined {
  return zones.length === 0 ? undefined : ({ "--calendar-zones": zones.length } as CSSProperties);
}

/** A day whose times in a secondary zone differ from its hours beside the grid. */
export interface TimeGridZoneNote {
  readonly date: Temporal.PlainDate;
  /** Short, such as "EST −1h". */
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
  /** In tooltips and slot names: the zone's `label`, or its long name, such as "Eastern Daylight Time". */
  readonly name: string;
  /** The days whose times differ from its hours beside the grid. */
  readonly notes: readonly TimeGridZoneNote[];
  readonly timeZone: string;
}

/** `Intl`'s name for a time zone at an instant, in the calendar's locale. */
function zoneName(
  locale: Intl.LocalesArgument,
  timeZone: string,
  instant: Temporal.Instant,
  timeZoneName: "long" | "short",
): string {
  return (
    new Intl.DateTimeFormat(locale, { timeZone, timeZoneName })
      .formatToParts(instant)
      .find(({ type }) => type === "timeZoneName")?.value ?? timeZone
  );
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

/** "+1h" and "1 hour", or "+30m" and "30 minutes" for a shift that isn't whole hours. */
function shiftFormats(locale: Intl.LocalesArgument) {
  const amount = (unit: "hour" | "minute", unitDisplay: "long" | "narrow") =>
    new Intl.NumberFormat(locale, {
      signDisplay: unitDisplay === "narrow" ? "always" : "never",
      style: "unit",
      unit,
      unitDisplay,
    });
  const units = {
    hour: { long: amount("hour", "long"), narrow: amount("hour", "narrow") },
    minute: { long: amount("minute", "long"), narrow: amount("minute", "narrow") },
  };
  return {
    amount: (minutes: number, display: "long" | "narrow") =>
      minutes % 60 === 0
        ? units.hour[display].format(minutes / 60)
        : units.minute[display].format(minutes),
    time: new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }),
  };
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

    return secondaryTimeZones.map(({ label, timeZone }) => {
      const axis = timeGridZoneAxis(columns, timeZone, { visible })!;
      const at = columnOn(axis.date).day.start;
      const runsByDate = new Map<string, TimeGridZoneShift[]>();
      for (const shift of axis.shifts) {
        const key = shift.date.toString();
        runsByDate.set(key, [...(runsByDate.get(key) ?? []), shift]);
      }
      const notes = [...runsByDate.values()].map((runs) => {
        // The day's last run is how it reads from then on, named as the zone is by then, such as
        // EST after EDT; the title has every run.
        const last = runs.at(-1)!;
        const column = columnOn(last.date);
        const then =
          timeGridZoneTimes(column, last.from, axis.timeZone)[0]?.instant ?? column.day.start;
        const long = label ?? zoneName(locale, axis.timeZone, then, "long");
        const titles = runs.map(({ from, minutes, until }) => {
          const span =
            until === null
              ? `From ${formats.time.format(from)}`
              : `From ${formats.time.format(from)} to ${formats.time.format(until)}`;
          const direction = minutes > 0 ? "later" : "earlier";
          return `${span}, times in ${long} are ${formats.amount(minutes, "long")} ${direction} than the hours beside the grid`;
        });
        return {
          date: last.date,
          text: `${label ?? zoneName(locale, axis.timeZone, then, "short")} ${formats.amount(last.minutes, "narrow")}`,
          title: titles.join(". "),
        };
      });
      return {
        axis,
        label: label ?? zoneName(locale, axis.timeZone, at, "short"),
        name: label ?? zoneName(locale, axis.timeZone, at, "long"),
        notes,
        timeZone: axis.timeZone,
      };
    });
  }, [columns, locale, secondaryTimeZones, visible]);
}

/** Rows label lines from 1:00 to 23:00, like the display zone's hours; midnight sits under the header. */
function labelledRows(axis: TimeGridZoneAxis) {
  return axis.rows.filter(({ top }) => top > 0);
}

/**
 * A secondary zone's hour labels on the display zone's lines, over the full height of the element
 * around them: its time at each line, with "+1" or "−1" where it's on another date. A skipped hour
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
      className={cn("relative h-full", className)}
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
              <span data-day-offset="" className="ms-px align-super text-[0.5rem]">
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
 * What a slot reads in each secondary zone, for its accessible name: "3:00 AM Eastern Daylight
 * Time", with the weekday when it's another date there; `undefined` without zones.
 */
export function describeZoneTimes(
  column: TimeGridColumn,
  time: Temporal.PlainTime,
  zones: readonly TimeGridZone[],
  formats: { readonly dayTime: Intl.DateTimeFormat; readonly time: Intl.DateTimeFormat },
): string | undefined {
  const parts = zones.flatMap((zone) => {
    const times = timeGridZoneTimes(column, time, zone.timeZone);
    if (times.length === 0) return [];
    const read = times.map(({ dateTime, dayOffset }) =>
      dayOffset === 0
        ? formats.time.format(dateTime.toPlainTime())
        : formats.dayTime.format(dateTime),
    );
    return [`${read.join(" or ")} ${zone.name}`];
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
          className="w-(--calendar-zone-width) shrink-0 truncate pe-1 text-end"
          title={zone.name}
        >
          {zone.label}
        </span>
      ))}
      <span className="min-w-0 flex-1 pe-2 text-end whitespace-nowrap">{offset}</span>
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
        "flex max-w-full flex-col text-[0.5625rem] leading-tight whitespace-nowrap text-muted-foreground",
        className,
      )}
    >
      {notes.map((note, index) => (
        <span key={index} className="truncate" title={note.title}>
          {note.text}
        </span>
      ))}
    </span>
  );
}
