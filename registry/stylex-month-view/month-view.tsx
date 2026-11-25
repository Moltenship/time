"use client";

import {
  defineCalendarView,
  getMonthRange,
  getMonthTitle,
  limitDayGridLanes,
  monthSpatialNavigation,
  navigateMonth,
  projectMonth,
  type CalendarViewProjectionInput,
  type CalendarViewRendererProps,
  type EventId,
  type MonthProjection,
  type ResourceId,
  useCalendarAnnouncer,
  useCalendarFocus,
  useCalendarPointer,
} from "@moltenship/calendar";
import * as stylex from "@stylexjs/stylex";
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";

import { useEventLabel, type EventDescriber } from "@registry/stylex-calendar/event-label";
import type { UnavailableTimeRender } from "@registry/stylex-calendar/unavailable-time";
import { useViewKeyboard } from "@registry/stylex-calendar/view-keyboard";
import { calendarVars } from "@registry/stylex-calendar-theme/calendar-tokens.stylex";
import type { CalendarEventColor } from "@registry/stylex-calendar-theme/event-colors";
import {
  attachLaneCapacity,
  INITIAL_LANES,
  rowSizes,
  weekHidingFocus,
} from "@registry/shared/month-view/month-layout";
import { monthFormats, type MonthFormats } from "@registry/shared/month-view/month-labels";

import { LaneProbe, MonthWeekRow } from "./month-week";

export { weekHidingFocus };

const styles = stylex.create({
  body: {
    display: "grid",
    flex: "1 1 0%",
    minHeight: 0,
    overflowY: "auto",
  },
  editable: {
    WebkitTouchCallout: { default: null, "@media (pointer: coarse)": "none" },
    WebkitUserSelect: {
      default: null,
      "[data-interaction]": "none",
      "@media (pointer: coarse)": "none",
    },
    userSelect: {
      default: null,
      "[data-interaction]": "none",
      "@media (pointer: coarse)": "none",
    },
  },
  header: {
    borderBottomColor: calendarVars["--calendar-grid"],
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "grid",
    flexShrink: 0,
    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
  },
  root: {
    "--calendar-ghost-background": calendarVars["--calendar-selection"],
    "--calendar-month-lane": { default: "22px", "@media (pointer: coarse)": "26px" },
    WebkitUserSelect: { default: null, "[data-interaction]": "none" },
    cursor: { default: null, '[data-interaction="move"]': "grabbing" },
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
    userSelect: { default: null, "[data-interaction]": "none" },
  },
  weekday: {
    color: calendarVars["--muted-foreground"],
    fontSize: "0.6875rem",
    fontWeight: 500,
    paddingBlock: "0.5rem",
    textAlign: "center",
    textTransform: "uppercase",
  },
});

export interface MonthViewOptions<TEvent> {
  /**
   * How a pointer drag's preview moves: from slot to slot (`"snapped"`, the default), or with the
   * pointer over a marker of where it would land (`"free"`), snapping there on release. Both
   * propose the same snapped placement.
   */
  readonly dragPreview?: "free" | "snapped";
  /** Extra words for each event's accessible name, such as its calendar. */
  readonly describeEvent?: EventDescriber<TEvent>;
  /** Picks each event's `data-color`; events without one use the theme's default colour. */
  readonly getEventColor?: (event: TEvent) => CalendarEventColor;
  /**
   * A small icon before an event's title, such as a repeat mark on recurring events, or nothing.
   * It's decorative and hidden from assistive technology: say the same in `describeEvent`, which
   * adds to each event's accessible name.
   */
  readonly getEventIcon?: (event: TEvent) => ReactNode;
  /**
   * Replaces the shading of closed days: an element, or a function of its props and of the band,
   * date and resource, such as hatching for holidays.
   */
  readonly renderUnavailable?: UnavailableTimeRender;
}

type MonthViewProps<TEvent> = CalendarViewRendererProps<
  MonthProjection<TEvent, EventId, ResourceId>,
  MonthViewOptions<TEvent>
>;

/**
 * Measures how many event lanes fit in a week row, again only when the grid or the lane height
 * changes: `probe` is a `LaneProbe`.
 */
function useLaneCapacity(
  body: RefObject<HTMLElement | null>,
  probe: RefObject<HTMLElement | null>,
  weekCount: number,
): number {
  const [lanes, setLanes] = useState(INITIAL_LANES);

  useLayoutEffect(() => {
    const element = body.current;
    if (element === null) return;
    return attachLaneCapacity(element, { onChange: setLanes, probe: probe.current, weekCount });
  }, [body, probe, weekCount]);

  return lanes;
}

export function useMonthFormats(locale: Intl.LocalesArgument): MonthFormats {
  return useMemo(() => monthFormats(locale), [locale]);
}

function MonthView<TEvent>({
  actions,
  environment,
  events,
  isReadOnly,
  options,
  projection,
  range,
}: MonthViewProps<TEvent>) {
  const body = useRef<HTMLDivElement>(null);
  // Pointer drags speak through the same messages as the keyboard.
  const announcer = useCalendarAnnouncer();
  const pointerRef = useCalendarPointer({
    announcer,
    check: actions.checkEventChange,
    disabled: isReadOnly,
    events,
    onPropose: actions.proposeEventChange,
    preview: options.dragPreview,
    scrollContainer: body,
    timeZone: environment.timeZone,
  });
  const laneProbe = useRef<HTMLDivElement>(null);
  const maxLanes = useLaneCapacity(body, laneProbe, projection.weeks.length);
  const formats = useMonthFormats(environment.locale);
  const labelEvent = useEventLabel(environment, options.describeEvent);
  const keyboard = useViewKeyboard();
  const overflows = useMemo(
    () => projection.weeks.map((week) => limitDayGridLanes(week, maxLanes)),
    [maxLanes, projection.weeks],
  );
  const expandedWeek = useCalendarFocus((focus) =>
    weekHidingFocus(focus, projection.weeks, overflows),
  );
  const openDay = (date: Temporal.PlainDate) => {
    actions.setAnchorDate(date);
    actions.setView("day");
  };

  return (
    <div
      ref={pointerRef}
      role="grid"
      aria-label={getMonthTitle(range, environment)}
      {...keyboard}
      data-slot="month-view"
      {...stylex.props(
        styles.root,
        // A long-press on a touch screen picks events up: it selects no text and opens no callout.
        !isReadOnly && styles.editable,
      )}
    >
      <LaneProbe ref={laneProbe} />
      <div role="row" {...stylex.props(styles.header)}>
        {projection.weeks[0]?.days.map(({ date }) => (
          <div
            key={date.dayOfWeek}
            role="columnheader"
            aria-label={formats.weekdayName.format(date)}
            {...stylex.props(styles.weekday)}
          >
            {formats.weekday.format(date)}
          </div>
        ))}
      </div>
      <div
        ref={body}
        {...stylex.props(styles.body)}
        style={{ gridTemplateRows: rowSizes(projection.weeks, expandedWeek) }}
      >
        {projection.weeks.map((week, index) => (
          <MonthWeekRow
            key={week.range.start.toString()}
            expanded={index === expandedWeek}
            formats={formats}
            getEventColor={options.getEventColor}
            getEventIcon={options.getEventIcon}
            labelEvent={labelEvent}
            maxLanes={maxLanes}
            onOpenDay={openDay}
            overflow={overflows[index]!}
            renderUnavailable={options.renderUnavailable}
            week={week}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * A Google Calendar-style month grid named `month`. Clicking a date opens the `day` view on it;
 * dragging an event moves it to another day, and dragging across days creates an all-day event.
 * The grid has one tab stop: arrow keys move between days, Enter enters a day's events, Space
 * grabs an event to move it (Shift+Space to resize) or a day to create an event, and Shift+Enter
 * opens a day. Pass default options here; a root can override them through `viewOptions.month`.
 */
export function createMonthView<TEvent>(defaultOptions: MonthViewOptions<TEvent> = {}) {
  return defineCalendarView({
    name: "month",
    defaultOptions,
    strategy: {
      getRange: getMonthRange,
      getSpatialNavigation: monthSpatialNavigation,
      getTitle: getMonthTitle,
      navigate: navigateMonth,
      project: (input: CalendarViewProjectionInput<MonthViewOptions<TEvent>, TEvent>) =>
        projectMonth(input),
    },
    Renderer: MonthView<TEvent>,
  });
}
