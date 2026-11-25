"use client";

import {
  type CalendarEnvironmentBase,
  type PlainDateInterval,
  type TimeGridColumn,
} from "@moltenship/calendar";
import * as stylex from "@stylexjs/stylex";
import { useMemo, type CSSProperties } from "react";

import { calendarVars } from "@registry/stylex-calendar-theme/calendar-tokens.stylex";
import { type XStyle, xprops } from "@registry/stylex-calendar-theme/xprops";
import {
  gutterStyle as zonesGutterStyle,
  timeGridZones,
  zoneHourFormats,
  zoneHourLabels,
  type TimeGridZone,
  type TimeGridZoneNote,
} from "@registry/shared/time-grid-view/secondary-zones";

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

const styles = stylex.create({
  dayOffset: {
    fontSize: "0.5rem",
    lineHeight: 1,
    marginInlineStart: "1px",
    position: "relative",
    top: "-0.25rem",
  },
  gutter: {
    "--calendar-gutter-width":
      "calc(var(--calendar-hours-width) + var(--calendar-zones, 0) * var(--calendar-zone-width, 4rem))",
    "--calendar-hours-width": { default: "3rem", "@media (min-width: 640px)": "4rem" },
  },
  note: {
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  notes: {
    color: calendarVars["--muted-foreground"],
    display: "flex",
    flexDirection: "column",
    fontSize: "0.5625rem",
    lineHeight: 1.25,
    maxWidth: "100%",
    minWidth: 0,
    whiteSpace: "nowrap",
  },
  offset: {
    display: "flex",
    flex: 1,
    justifyContent: "flex-end",
    minWidth: 0,
    paddingInlineEnd: "0.5rem",
    whiteSpace: "nowrap",
  },
  // A secondary zone's column in the gutter; see `timeGridGutterClassName`.
  zoneColumn: {
    flexShrink: 0,
    width: "var(--calendar-zone-width, 4rem)",
  },
  zoneHour: {
    color: calendarVars["--calendar-axis"],
    fontSize: "0.625rem",
    fontVariantNumeric: "tabular-nums",
    insetInlineEnd: "0.25rem",
    position: "absolute",
    transform: "translateY(-50%)",
    whiteSpace: "nowrap",
  },
  zoneHours: {
    height: "100%",
    position: "relative",
  },
  zoneLabel: {
    overflow: "hidden",
    paddingInlineEnd: "0.25rem",
    textAlign: "end",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

/**
 * The gutter holds the display zone's hours, `--calendar-hours-width` wide (3rem, 4rem from `sm`),
 * and a column for each secondary zone, which `gutterStyle` counts. A zone's column is
 * `--calendar-zone-width` wide, 4rem by default: room for "12:30 AM+1". Set it, as a rem or px
 * length, on an element around the calendar for locales with longer times.
 */
export const timeGridGutterClassName = stylex.props(styles.gutter).className;

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
  xstyle,
  zone,
}: {
  readonly className?: string;
  readonly locale: Intl.LocalesArgument;
  readonly xstyle?: XStyle;
  readonly zone: TimeGridZone;
}) {
  const formats = useMemo(() => zoneHourFormats(locale), [locale]);

  return (
    <div
      aria-hidden
      data-slot="time-grid-zone-hours"
      data-time-zone={zone.timeZone}
      {...xprops({ className }, styles.zoneHours, styles.zoneColumn, xstyle)}
    >
      {zoneHourLabels(zone, formats).map(({ dayOffset, label, title, top, topStyle }) => (
        <span key={top} {...stylex.props(styles.zoneHour)} style={{ top: topStyle }} title={title}>
          {label}
          {dayOffset !== undefined && (
            // Raised without `vertical-align`, so the label keeps its height and its line.
            <span data-day-offset="" {...stylex.props(styles.dayOffset)}>
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
          {...stylex.props(styles.zoneLabel, styles.zoneColumn)}
          title={zone.name}
        >
          {zone.label}
        </span>
      ))}
      {/* A flex container, so an offset too long for the hours overflows outward, not into the days. */}
      <span {...stylex.props(styles.offset)}>{offset}</span>
    </>
  );
}

/** A day's notes under its date, where its times in a secondary zone differ from the gutter's. */
export function TimeGridZoneNotes({
  className,
  notes,
  xstyle,
}: {
  readonly className?: string;
  readonly notes: readonly TimeGridZoneNote[] | undefined;
  readonly xstyle?: XStyle;
}) {
  if (notes === undefined || notes.length === 0) return null;
  return (
    <span
      aria-hidden
      data-slot="time-grid-zone-note"
      {...xprops({ className }, styles.notes, xstyle)}
    >
      {notes.map((note, index) => (
        <span key={index} {...stylex.props(styles.note)} title={note.title}>
          {note.text}
        </span>
      ))}
    </span>
  );
}
