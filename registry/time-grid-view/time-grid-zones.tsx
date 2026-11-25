"use client";

import {
  type CalendarEnvironmentBase,
  type PlainDateInterval,
  type TimeGridColumn,
} from "@moltenship/calendar";
import { useMemo, type CSSProperties } from "react";

import {
  gutterStyle as zonesGutterStyle,
  timeGridZones,
  zoneHourFormats,
  zoneHourLabels,
  type TimeGridZone,
  type TimeGridZoneNote,
} from "@registry/shared/time-grid-view/secondary-zones";
import {
  gutterOffsetClass,
  zoneDayOffsetClass,
  zoneHourLabelClass,
  zoneHoursClass,
  zoneLabelClass,
  zoneNoteClass,
  zoneNotesClass,
} from "@registry/shared/time-grid-view/time-grid.styles";

export {
  describeZoneTimes,
  gutterColumn,
  zoneNotesByDate,
  zoneTimeFormat,
} from "@registry/shared/time-grid-view/secondary-zones";
export type {
  TimeGridZone,
  TimeGridZoneNote,
} from "@registry/shared/time-grid-view/secondary-zones";
export { timeGridGutterClassName } from "@registry/shared/time-grid-view/time-grid.styles";

/** Widens the gutter by a column per secondary zone; see `timeGridGutterClassName`. */
export function gutterStyle(zones: readonly TimeGridZone[]): CSSProperties | undefined {
  return zonesGutterStyle(zones) as CSSProperties | undefined;
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
  const { locale, secondaryTimeZones } = environment;
  return useMemo(
    () => timeGridZones({ locale, secondaryTimeZones }, columns, visible),
    [columns, locale, secondaryTimeZones, visible],
  );
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
  const formats = useMemo(() => zoneHourFormats(locale), [locale]);

  return (
    <div
      aria-hidden
      data-slot="time-grid-zone-hours"
      data-time-zone={zone.timeZone}
      className={zoneHoursClass(className)}
    >
      {zoneHourLabels(zone, formats).map(({ dayOffset, label, title, top, topStyle }) => (
        <span key={top} className={zoneHourLabelClass} style={{ top: topStyle }} title={title}>
          {label}
          {dayOffset !== undefined && (
            <span data-day-offset="" className={zoneDayOffsetClass}>
              {dayOffset}
            </span>
          )}
        </span>
      ))}
    </div>
  );
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
          className={zoneLabelClass}
          title={zone.name}
        >
          {zone.label}
        </span>
      ))}
      <span className={gutterOffsetClass}>{offset}</span>
    </>
  );
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
    <span aria-hidden data-slot="time-grid-zone-note" className={zoneNotesClass(className)}>
      {notes.map((note, index) => (
        <span key={index} className={zoneNoteClass} title={note.title}>
          {note.text}
        </span>
      ))}
    </span>
  );
}
