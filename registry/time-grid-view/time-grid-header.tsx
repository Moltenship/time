"use client";

import {
  plainDateIntervalContains,
  type CalendarEnvironmentBase,
  type CalendarViewActions,
  type PlainDateInterval,
  type TimeGridDay,
} from "@moltenship/calendar";
import { useId, useMemo } from "react";

import { offsetLabel } from "@registry/shared/time-grid-view/secondary-zones";
import { dayColumns } from "@registry/shared/time-grid-view/time-grid-geometry";
import { dayHeaderFormats, openDayLabel } from "@registry/shared/time-grid-view/time-grid-labels";
import {
  dayHeaderButtonClass,
  dayHeaderClass,
  dayHeaderNotesClass,
  dayHeaderNumberClass,
  dayHeaderWeekdayClass,
  srOnlyClass,
  timeGridCornerClass,
  timeGridDaysClass,
  timeGridHeaderRowClass,
} from "@registry/shared/time-grid-view/time-grid.styles";

import { describeDayAnnotations } from "@registry/shared/time-grid-view/annotation-label";
import type { TimeGridAnnotationWiring } from "./time-grid-annotations";
import {
  gutterColumn,
  TimeGridGutterLabels,
  TimeGridZoneNotes,
  zoneNotesByDate,
  type TimeGridZone,
} from "./time-grid-zones";

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

export { offsetLabel } from "@registry/shared/time-grid-view/secondary-zones";

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
  const formats = useMemo(() => dayHeaderFormats(locale), [locale]);
  const opensDay = !single && dayView !== undefined;

  return (
    <div className={timeGridDaysClass} style={{ gridTemplateColumns: dayColumns(days.length) }}>
      {days.map(({ column: { date }, isToday }, index) => {
        const label = formats.full.format(date);
        const marks = annotations?.layout.columns[index];
        const summary =
          annotations === undefined || marks === undefined
            ? undefined
            : describeDayAnnotations(marks, annotations.formats);
        const number = (
          <span className={dayHeaderNumberClass(single, isToday, opensDay)}>{date.day}</span>
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
            className={dayHeaderClass(single)}
            role="columnheader"
          >
            <span className={dayHeaderWeekdayClass(isToday)}>{formats.weekday.format(date)}</span>
            {opensDay ? (
              <button
                aria-label={openDayLabel(label)}
                // The grid keeps one tab stop; Shift+Enter on a day's cells opens it.
                tabIndex={-1}
                className={dayHeaderButtonClass}
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
              className={dayHeaderNotesClass(single)}
              notes={notes.get(date.toString())}
            />
            {summary !== undefined && (
              <span className={srOnlyClass} id={`${summaryId}-${index}`}>
                {summary}
              </span>
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
    <div role="row" className={timeGridHeaderRowClass}>
      <div role="columnheader" className={timeGridCornerClass}>
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
