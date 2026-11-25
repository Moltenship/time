import {
  plainDateIntervalContains,
  type CalendarEnvironmentBase,
  type CalendarViewActions,
  type PlainDateInterval,
  type TimeGridDay,
} from "@moltenship/calendar-solid";
import { createMemo, For, Show } from "solid-js";

import { offsetLabel } from "@registry/shared/time-grid-view/secondary-zones";
import { dayColumns } from "@registry/shared/time-grid-view/time-grid-geometry";
import { dayHeaderFormats, openDayLabel } from "@registry/shared/time-grid-view/time-grid-labels";
import {
  dayHeaderButtonClass,
  dayHeaderClass,
  dayHeaderNotesClass,
  dayHeaderNumberClass,
  dayHeaderWeekdayClass,
  timeGridCornerClass,
  timeGridDaysClass,
  timeGridHeaderRowClass,
} from "@registry/shared/time-grid-view/time-grid.styles";

import {
  gutterColumn,
  TimeGridGutterLabels,
  TimeGridZoneNotes,
  zoneNotesByDate,
  type TimeGridZone,
} from "./time-grid-zones";

export { offsetLabel } from "@registry/shared/time-grid-view/secondary-zones";

const noZones: readonly TimeGridZone[] = [];

export interface TimeGridHeaderProps {
  readonly actions: CalendarViewActions;
  readonly days: readonly TimeGridDay<unknown>[];
  /** View a date opens in a multi-day grid; dates are static without one. */
  readonly dayView: string | undefined;
  readonly environment: CalendarEnvironmentBase;
  /** The root's secondary time zones, named over their hours; see `useTimeGridZones`. */
  readonly zones?: readonly TimeGridZone[];
}

export interface TimeGridDayHeadersProps {
  readonly actions: CalendarViewActions;
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
export function TimeGridDayHeaders(props: TimeGridDayHeadersProps) {
  const notes = createMemo(() => zoneNotesByDate(props.zones ?? noZones));
  const formats = createMemo(() => dayHeaderFormats(props.environment.locale));
  const opensDay = () => !props.single && props.dayView !== undefined;

  return (
    <div
      class={timeGridDaysClass}
      style={{ "grid-template-columns": dayColumns(props.days.length) }}
    >
      <For each={props.days} keyed={(day) => day.column.date.toString()}>
        {(day) => {
          const date = () => day().column.date;
          const label = () => formats().full.format(date());
          const number = () => (
            <span class={dayHeaderNumberClass(props.single, day().isToday, opensDay())}>
              {date().day}
            </span>
          );

          return (
            <div
              aria-current={day().isToday ? "date" : undefined}
              aria-hidden={
                props.shown === undefined || plainDateIntervalContains(props.shown, date())
                  ? undefined
                  : "true"
              }
              aria-label={label()}
              class={dayHeaderClass(props.single)}
              role="columnheader"
            >
              <span class={dayHeaderWeekdayClass(day().isToday)}>
                {formats().weekday.format(date())}
              </span>
              <Show when={opensDay()} fallback={number()}>
                <button
                  aria-label={openDayLabel(label())}
                  // The grid keeps one tab stop; Shift+Enter on a day's cells opens it.
                  tabindex={-1}
                  class={dayHeaderButtonClass}
                  onClick={() => {
                    props.actions.setAnchorDate(date());
                    props.actions.setView(props.dayView!);
                  }}
                  type="button"
                >
                  {number()}
                </button>
              </Show>
              <TimeGridZoneNotes
                class={dayHeaderNotesClass(props.single)}
                notes={notes().get(date().toString())}
              />
            </div>
          );
        }}
      </For>
    </div>
  );
}

/**
 * The grid's header row: the display zone's offset over the hour gutter, after the name of each
 * secondary zone, then the weekday and date naming each column. In a multi-day grid the date can
 * open that day.
 */
export function TimeGridHeader(props: TimeGridHeaderProps) {
  const zones = () => props.zones ?? noZones;
  const cornerOffset = createMemo(() => {
    const { locale, timeZone } = props.environment;
    const corner = gutterColumn(
      props.days.map(({ column }) => column),
      zones(),
    );
    return corner === undefined ? undefined : offsetLabel(locale, timeZone, corner);
  });

  return (
    <div role="row" class={timeGridHeaderRowClass}>
      <div role="columnheader" class={timeGridCornerClass}>
        <TimeGridGutterLabels offset={cornerOffset()} zones={zones()} />
      </div>
      <TimeGridDayHeaders
        actions={props.actions}
        days={props.days}
        dayView={props.dayView}
        environment={props.environment}
        single={props.days.length === 1}
        zones={zones()}
      />
    </div>
  );
}
