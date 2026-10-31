"use client";

import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import {
  plainDateIntervalContains,
  type CalendarEnvironmentBase,
  type CalendarViewActions,
  type PlainDateInterval,
  type TimeGridColumn,
  type TimeGridDay,
} from "@moltenship/calendar";
import * as stylex from "@stylexjs/stylex";
import { useId, useMemo } from "react";

import {
  calendarMarker,
  calendarVars,
} from "@registry/stylex-calendar-theme/calendar-tokens.stylex";

import { describeDayAnnotations } from "./annotation-label";
import type { TimeGridAnnotationWiring } from "./time-grid-annotations";
import {
  gutterColumn,
  TimeGridGutterLabels,
  TimeGridZoneNotes,
  zoneNotesByDate,
  type TimeGridZone,
} from "./time-grid-zones";

const styles = stylex.create({
  corner: {
    alignItems: "flex-end",
    color: calendarVars["--calendar-axis"],
    display: "flex",
    flexShrink: 0,
    fontSize: "0.625rem",
    paddingBottom: "0.25rem",
    width: "var(--calendar-gutter-width)",
  },
  day: {
    display: "flex",
    flexDirection: "column",
    gap: "0.125rem",
    minWidth: 0,
    paddingBlock: "0.5rem",
  },
  dayMany: {
    alignItems: "center",
  },
  days: {
    display: "grid",
    flex: 1,
  },
  daySingle: {
    alignItems: "flex-start",
    paddingInline: "0.5rem",
  },
  notesMany: {
    alignItems: "center",
  },
  notesSingle: {
    alignItems: "flex-start",
  },
  number: {
    alignItems: "center",
    borderRadius: "9999px",
    display: "flex",
    fontSize: { default: "1.25rem", "@media (min-width: 640px)": "1.5rem" },
    fontVariantNumeric: "tabular-nums",
    justifyContent: "center",
    lineHeight: { default: "1.75rem", "@media (min-width: 640px)": "2rem" },
  },
  numberMany: {
    height: { default: "2.25rem", "@media (min-width: 640px)": "2.75rem" },
    width: { default: "2.25rem", "@media (min-width: 640px)": "2.75rem" },
  },
  numberOpens: {
    backgroundColor: {
      default: null,
      [stylex.when.ancestor(":hover", calendarMarker)]: calendarVars["--accent"],
    },
  },
  numberSingle: {
    height: "2.75rem",
    width: "2.75rem",
  },
  numberToday: {
    backgroundColor: calendarVars["--calendar-today"],
    color: calendarVars["--calendar-today-foreground"],
  },
  open: {
    appearance: "none",
    backgroundColor: "transparent",
    borderRadius: "9999px",
    borderWidth: 0,
    color: "inherit",
    cursor: "pointer",
    fontFamily: "inherit",
    outlineColor: { default: null, ":focus-visible": calendarVars["--ring"] },
    outlineOffset: { default: null, ":focus-visible": 1 },
    outlineStyle: { default: null, ":focus-visible": "solid" },
    outlineWidth: { default: null, ":focus-visible": 2 },
    padding: 0,
  },
  row: {
    display: "flex",
  },
  weekday: {
    fontSize: "0.6875rem",
    fontWeight: 500,
    letterSpacing: "0.025em",
    textTransform: "uppercase",
  },
  weekdayOther: {
    color: calendarVars["--muted-foreground"],
  },
  weekdayToday: {
    color: calendarVars["--calendar-today"],
  },
});

export interface TimeGridHeaderProps {
  readonly actions: CalendarViewActions;
  /** The root's annotations; each day's header describes its own. */
  readonly annotations?: TimeGridAnnotationWiring;
  readonly days: readonly TimeGridDay<unknown>[];
  /** View a date opens in a multi-day grid; dates are static without one. */
  readonly dayView: string | undefined;
  readonly environment: CalendarEnvironmentBase;
  /** The root's secondary time zones, named over their hours; see `useTimeGridZones`. */
  readonly zones?: readonly TimeGridZone[];
}

const noZones: readonly TimeGridZone[] = [];

/** "GMT-4" for the display zone at the start of a column, such as the first visible day. */
export function offsetLabel(
  locale: Intl.LocalesArgument,
  timeZone: string,
  column: TimeGridColumn,
) {
  return new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: "shortOffset" })
    .formatToParts(column.day.start)
    .find((part) => part.type === "timeZoneName")?.value;
}

export interface TimeGridDayHeadersProps {
  readonly actions: CalendarViewActions;
  /** The root's annotations; each day's header describes its own. */
  readonly annotations?: TimeGridAnnotationWiring;
  readonly days: readonly TimeGridDay<unknown>[];
  /** View a date opens in a multi-day grid; dates are static without one. */
  readonly dayView: string | undefined;
  readonly environment: CalendarEnvironmentBase;
  /**
   * The dates on screen, when the grid renders days around them while it scrolls; the others are
   * hidden from assistive technology. All of `days` by default.
   */
  readonly shown?: PlainDateInterval;
  /** Whether the grid shows one day, which takes the larger, start-aligned date. */
  readonly single: boolean;
  /**
   * The root's secondary time zones. A day whose times in one differ from the gutter's, after a
   * daylight saving change, says so under its date.
   */
  readonly zones?: readonly TimeGridZone[];
}

/** A column header per day: the weekday and date, which can open that day in a multi-day grid. */
export function TimeGridDayHeaders({
  actions,
  annotations,
  days,
  dayView,
  environment,
  shown,
  single,
  zones = noZones,
}: TimeGridDayHeadersProps) {
  const { locale } = environment;
  const summaryId = useId();
  const notes = useMemo(() => zoneNotesByDate(zones), [zones]);
  const formats = useMemo(
    () => ({
      full: new Intl.DateTimeFormat(locale, { dateStyle: "full" }),
      weekday: new Intl.DateTimeFormat(locale, { weekday: "short" }),
    }),
    [locale],
  );
  const opensDay = !single && dayView !== undefined;

  return (
    <div
      {...stylex.props(styles.days)}
      style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
    >
      {days.map(({ column: { date }, isToday }, index) => {
        const label = formats.full.format(date);
        const marks = annotations?.layout.columns[index];
        const summary =
          annotations === undefined || marks === undefined
            ? undefined
            : describeDayAnnotations(marks, annotations.formats);
        const number = (
          <span
            {...stylex.props(
              styles.number,
              single ? styles.numberSingle : styles.numberMany,
              isToday ? styles.numberToday : opensDay && styles.numberOpens,
            )}
          >
            {date.day}
          </span>
        );

        return (
          <div
            key={date.toString()}
            aria-current={isToday ? "date" : undefined}
            aria-describedby={summary === undefined ? undefined : `${summaryId}-${index}`}
            aria-hidden={
              shown === undefined || plainDateIntervalContains(shown, date) ? undefined : true
            }
            aria-label={label}
            {...stylex.props(styles.day, single ? styles.daySingle : styles.dayMany)}
            role="columnheader"
          >
            <span
              {...stylex.props(styles.weekday, isToday ? styles.weekdayToday : styles.weekdayOther)}
            >
              {formats.weekday.format(date)}
            </span>
            {opensDay ? (
              <button
                aria-label={`Open ${label}`}
                // The grid keeps one tab stop; Shift+Enter on a day's cells opens it.
                tabIndex={-1}
                {...stylex.props(styles.open, calendarMarker)}
                onClick={() => {
                  actions.setAnchorDate(date);
                  actions.setView(dayView);
                }}
                type="button"
              >
                {number}
              </button>
            ) : (
              number
            )}
            <TimeGridZoneNotes
              notes={notes.get(date.toString())}
              xstyle={single ? styles.notesSingle : styles.notesMany}
            />
            {summary !== undefined && (
              <VisuallyHidden id={`${summaryId}-${index}`}>{summary}</VisuallyHidden>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The grid's header row: the display zone's offset over the hour gutter, after the name of each
 * secondary zone, then the weekday and date naming each column. In a multi-day grid the date can
 * open that day.
 */
export function TimeGridHeader({
  actions,
  annotations,
  days,
  dayView,
  environment,
  zones = noZones,
}: TimeGridHeaderProps) {
  const { locale, timeZone } = environment;
  const corner = gutterColumn(
    days.map(({ column }) => column),
    zones,
  );
  const cornerOffset = corner === undefined ? undefined : offsetLabel(locale, timeZone, corner);

  return (
    <div role="row" {...stylex.props(styles.row)}>
      <div role="columnheader" {...stylex.props(styles.corner)}>
        <TimeGridGutterLabels offset={cornerOffset} zones={zones} />
      </div>
      <TimeGridDayHeaders
        actions={actions}
        annotations={annotations}
        days={days}
        dayView={dayView}
        environment={environment}
        single={days.length === 1}
        zones={zones}
      />
    </div>
  );
}
