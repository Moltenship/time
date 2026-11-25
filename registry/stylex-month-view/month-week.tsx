"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import {
  useCalendarInteraction,
  useClosedDates,
  useRovingFocus,
  type DayGridOverflow,
  type DayGridSegment,
  type EventId,
  type MonthDay,
  type MonthWeek,
  type ResourceId,
} from "@moltenship/calendar";
import * as stylex from "@stylexjs/stylex";
import type { ReactNode, Ref } from "react";

import type { EventLabeler } from "@registry/stylex-calendar/event-label";
import { previewCheckAttributes, useDraftCheck } from "@registry/stylex-calendar/preview-check";
import {
  UnavailableTime,
  type UnavailableTimeRender,
} from "@registry/stylex-calendar/unavailable-time";
import { calendarVars } from "@registry/stylex-calendar-theme/calendar-tokens.stylex";
import type { CalendarEventColor } from "@registry/stylex-calendar-theme/event-colors";
import { type XStyle, xprops } from "@registry/stylex-calendar-theme/xprops";
import {
  closedDaysOf,
  eventKey,
  fragmentOn,
  inAllDayDraft,
  isBarFragment,
  isBarSegment,
  laneBox,
  segmentsOn,
  segmentsStartingOn,
  type ClosedDay,
} from "@registry/shared/month-view/month-layout";
import {
  dateButtonLabel,
  dateButtonText,
  dayCellLabel,
  dayEventsLabel,
  moreEventsLabel,
  moreEventsText,
  startTime,
  type MonthFormats,
} from "@registry/shared/month-view/month-labels";

import { MonthEvent } from "./month-event";

export {
  DATE_ROW_HEIGHT,
  LANE_HEIGHT,
  laneHeightOf,
  lanesIn,
  weekHeight,
} from "@registry/shared/month-view/month-layout";
export type { MonthFormats } from "@registry/shared/month-view/month-labels";

const popInBlockEnd = stylex.keyframes({
  from: { opacity: 0, transform: "translate3d(0, 0.5rem, 0) scale3d(0.95, 0.95, 0.95)" },
});
const popInBlockStart = stylex.keyframes({
  from: { opacity: 0, transform: "translate3d(0, -0.5rem, 0) scale3d(0.95, 0.95, 0.95)" },
});
const popInInlineEnd = stylex.keyframes({
  from: { opacity: 0, transform: "translate3d(0.5rem, 0, 0) scale3d(0.95, 0.95, 0.95)" },
});
const popInInlineStart = stylex.keyframes({
  from: { opacity: 0, transform: "translate3d(-0.5rem, 0, 0) scale3d(0.95, 0.95, 0.95)" },
});
const popOut = stylex.keyframes({ to: { opacity: 0, transform: "scale3d(0.95, 0.95, 0.95)" } });

const styles = stylex.create({
  cell: {
    borderInlineEndColor: calendarVars["--calendar-grid"],
    borderInlineEndStyle: "solid",
    borderInlineEndWidth: { default: 1, ":last-child": 0 },
    minWidth: 0,
    outlineColor: { default: null, ":focus-visible": calendarVars["--ring"] },
    outlineOffset: { default: null, ":focus-visible": -2 },
    outlineStyle: { default: null, ":focus-visible": "solid" },
    outlineWidth: { default: null, ":focus-visible": 2 },
    position: "relative",
  },
  cellDate: {
    fontSize: "0.75rem",
    height: "1.5rem",
    lineHeight: "1rem",
    marginTop: "0.25rem",
    minWidth: "1.5rem",
    paddingInline: "0.375rem",
  },
  closed: {
    backgroundColor: calendarVars["--calendar-closed"],
    inset: 0,
  },
  date: {
    alignItems: "center",
    appearance: "none",
    backgroundColor: { default: "transparent", ":hover": calendarVars["--accent"] },
    borderRadius: "9999px",
    borderWidth: 0,
    color: "inherit",
    cursor: "pointer",
    display: "flex",
    fontFamily: "inherit",
    fontSize: "inherit",
    fontVariantNumeric: "tabular-nums",
    fontWeight: 500,
    justifyContent: "center",
    lineHeight: "inherit",
    outlineColor: { default: null, ":focus-visible": calendarVars["--ring"] },
    outlineOffset: { default: null, ":focus-visible": 1 },
    outlineStyle: { default: null, ":focus-visible": "solid" },
    outlineWidth: { default: null, ":focus-visible": 2 },
    padding: 0,
  },
  dateOutside: {
    color: {
      default: calendarVars["--muted-foreground"],
      ":hover": calendarVars["--accent-foreground"],
    },
  },
  dateToday: {
    backgroundColor: {
      default: calendarVars["--calendar-today"],
      ":hover": `color-mix(in oklch, ${calendarVars["--calendar-today"]} 90%, transparent)`,
    },
    color: calendarVars["--calendar-today-foreground"],
  },
  day: {
    backgroundColor: {
      default: null,
      "[data-draft]": {
        default: calendarVars["--calendar-selection"],
        "[data-invalid]": `color-mix(in oklch, ${calendarVars["--calendar-invalid"]} 15%, transparent)`,
      },
    },
    display: "flex",
    inset: 0,
    justifyContent: "center",
    outlineColor: {
      default: null,
      "[data-invalid]": calendarVars["--calendar-invalid"],
      "[data-warning]": calendarVars["--calendar-warning"],
    },
    outlineOffset: { default: null, "[data-invalid]": -2, "[data-warning]": -2 },
    outlineStyle: { default: null, "[data-invalid]": "dashed", "[data-warning]": "dashed" },
    outlineWidth: { default: null, "[data-invalid]": 2, "[data-warning]": 2 },
    position: "absolute",
  },
  dayOutside: {
    backgroundColor: {
      default: `color-mix(in oklch, ${calendarVars["--muted"]} 50%, transparent)`,
      "[data-draft]": {
        default: calendarVars["--calendar-selection"],
        "[data-invalid]": `color-mix(in oklch, ${calendarVars["--calendar-invalid"]} 15%, transparent)`,
      },
    },
  },
  laneProbe: {
    height: "var(--calendar-month-lane)",
    pointerEvents: "none",
    position: "absolute",
    visibility: "hidden",
    width: 0,
  },
  listed: {
    flexShrink: 0,
    height: "1.5rem",
  },
  more: {
    appearance: "none",
    backgroundColor: { default: "transparent", ":hover": calendarVars["--accent"] },
    borderRadius: "calc(var(--radius) * 0.6)",
    borderWidth: 0,
    color: {
      default: calendarVars["--muted-foreground"],
      ":hover": calendarVars["--foreground"],
    },
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: { default: "0.75rem", "@media (max-width: 639.98px)": "0.625rem" },
    fontWeight: 500,
    insetInlineStart: 0,
    lineHeight: "1rem",
    marginInline: "0.125rem",
    outlineColor: { default: null, ":focus-visible": calendarVars["--ring"] },
    outlineOffset: { default: null, ":focus-visible": 1 },
    outlineStyle: { default: null, ":focus-visible": "solid" },
    outlineWidth: { default: null, ":focus-visible": 2 },
    overflow: "hidden",
    paddingBlock: 0,
    paddingInline: { default: "0.375rem", "@media (max-width: 639.98px)": "0.25rem" },
    position: "absolute",
    textAlign: "start",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    zIndex: { default: 1, ":focus-visible": 10 },
  },
  moreLong: {
    display: { default: null, "@media (max-width: 639.98px)": "none" },
  },
  moreShort: {
    display: { default: null, "@media (min-width: 640px)": "none" },
  },
  popoverDate: {
    fontSize: "1.25rem",
    fontWeight: 400,
    height: "2.5rem",
    lineHeight: "1.75rem",
    width: "2.5rem",
  },
  popoverDay: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: "0.125rem",
    paddingBottom: "0.5rem",
  },
  popoverEvents: {
    display: "flex",
    flexDirection: "column",
    gap: "0.125rem",
    marginInline: "-0.5rem",
    minHeight: 0,
    overflowY: "auto",
    paddingBlock: "0.25rem",
    paddingInline: "0.5rem",
  },
  popoverWeekday: {
    color: calendarVars["--muted-foreground"],
    fontSize: "0.6875rem",
    fontWeight: 500,
    textTransform: "uppercase",
  },
  popup: {
    animationDuration: { default: "100ms", "@media (prefers-reduced-motion: reduce)": "0s" },
    animationName: {
      default: null,
      "[data-closed]": popOut,
      "[data-open]": {
        default: popInBlockStart,
        '[data-side="inline-end"]': popInInlineStart,
        '[data-side="inline-start"]': popInInlineEnd,
        '[data-side="left"]': popInInlineEnd,
        '[data-side="right"]': popInInlineStart,
        '[data-side="top"]': popInBlockEnd,
      },
    },
    backgroundColor: calendarVars["--popover"],
    borderRadius: "var(--radius)",
    boxShadow: `0 0 0 1px color-mix(in oklch, ${calendarVars["--foreground"]} 10%, transparent), 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)`,
    color: calendarVars["--popover-foreground"],
    display: "flex",
    flexDirection: "column",
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    maxHeight: "var(--available-height)",
    outlineColor: { default: null, "@media (forced-colors: active)": "transparent" },
    outlineOffset: { default: null, "@media (forced-colors: active)": 2 },
    outlineStyle: { default: "none", "@media (forced-colors: active)": "solid" },
    outlineWidth: { default: null, "@media (forced-colors: active)": 2 },
    padding: "0.5rem",
    transformOrigin: "var(--transform-origin)",
    width: "16rem",
    zIndex: 50,
  },
  positioner: {
    isolation: "isolate",
    zIndex: 50,
  },
  row: {
    borderBottomColor: calendarVars["--calendar-grid"],
    borderBottomStyle: "solid",
    borderBottomWidth: { default: 1, ":last-child": 0 },
    display: "grid",
    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
    minHeight: 0,
  },
  segment: {
    insetInlineStart: 0,
    marginInline: "0.125rem",
    position: "absolute",
    zIndex: { default: 1, ":focus-visible": 10, "[data-grabbed]": 20 },
  },
  segmentContinues: {
    marginInlineEnd: 0,
  },
  segmentContinued: {
    marginInlineStart: 0,
  },
});

/**
 * An invisible element one lane tall, for measuring `--calendar-month-lane` in any unit. Observe
 * it with the rows: it resizes when the pointer changes, and the lanes with it.
 */
export function LaneProbe({ ref }: { readonly ref: Ref<HTMLDivElement> }) {
  return <div ref={ref} aria-hidden {...stylex.props(styles.laneProbe)} />;
}

interface MonthWeekRowProps<TEvent> {
  readonly formats: MonthFormats;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor;
  /** An icon before an event's title, or nothing. */
  readonly getEventIcon?: (event: TEvent) => ReactNode;
  readonly labelEvent: EventLabeler<TEvent>;
  /** Shows every lane instead of `overflow`, while keyboard focus is on an event it hides. */
  readonly expanded: boolean;
  /** Lanes that fit in a cell, including the one a "+N more" control takes. */
  readonly maxLanes: number;
  /**
   * Rendered beside the visible weeks of a scrolling month, ready to scroll into view: its days
   * and events are not focus targets, so the visible weeks keep the view's tab stop.
   */
  readonly offscreen?: boolean;
  readonly onOpenDay: (date: Temporal.PlainDate) => void;
  /** The week's segments limited to `maxLanes`. */
  readonly overflow: DayGridOverflow<TEvent, EventId, ResourceId>;
  /** Replaces the shading of closed days; see `UnavailableTimeRender`. */
  readonly renderUnavailable?: UnavailableTimeRender;
  readonly week: MonthWeek<TEvent, EventId, ResourceId>;
}

type Segment<TEvent> = DayGridSegment<TEvent, EventId, ResourceId>;

function DateButton({
  className,
  day,
  formats,
  onOpenDay,
  tabIndex,
  xstyle,
}: {
  readonly className?: string;
  readonly day: MonthDay;
  readonly formats: MonthFormats;
  readonly onOpenDay: (date: Temporal.PlainDate) => void;
  readonly tabIndex?: number;
  readonly xstyle?: XStyle;
}) {
  return (
    <button
      type="button"
      aria-current={day.isToday ? "date" : undefined}
      aria-label={dateButtonLabel(formats, day.date)}
      onClick={() => onOpenDay(day.date)}
      tabIndex={tabIndex}
      {...xprops(
        { className },
        styles.date,
        // Muted on the hover fill falls short of 4.5:1. Today keeps its own colours.
        !day.inMonth && !day.isToday && styles.dateOutside,
        day.isToday && styles.dateToday,
        xstyle,
      )}
    >
      {dateButtonText(formats, day)}
    </button>
  );
}

/**
 * A day's "+N more" control and a list of all its events, for pointers. Keyboard focus reaches
 * the hidden events in place: their week row shows every lane while focus is on one.
 */
function MoreEvents<TEvent>({
  column,
  count,
  day,
  formats,
  getEventColor,
  getEventIcon,
  labelEvent,
  lane,
  onOpenDay,
  segments,
}: {
  readonly column: number;
  readonly count: number;
  readonly day: MonthDay;
  readonly formats: MonthFormats;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor;
  /** An icon before an event's title, or nothing. */
  readonly getEventIcon?: (event: TEvent) => ReactNode;
  readonly labelEvent: EventLabeler<TEvent>;
  readonly lane: number;
  readonly onOpenDay: (date: Temporal.PlainDate) => void;
  readonly segments: readonly Segment<TEvent>[];
}) {
  const text = moreEventsText(count);
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger
        data-slot="popover-trigger"
        aria-label={moreEventsLabel(formats, day.date, count)}
        // The view keeps one tab stop; arrow keys reach these events in the grid.
        tabIndex={-1}
        {...stylex.props(styles.more)}
        style={laneBox(lane)}
      >
        <span {...stylex.props(styles.moreLong)}>{text.long}</span>
        <span {...stylex.props(styles.moreShort)}>{text.short}</span>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner sideOffset={4} {...stylex.props(styles.positioner)}>
          <PopoverPrimitive.Popup
            data-slot="popover-content"
            aria-label={dayEventsLabel(formats, day.date)}
            {...stylex.props(styles.popup)}
          >
            <div {...stylex.props(styles.popoverDay)}>
              <span {...stylex.props(styles.popoverWeekday)}>
                {formats.weekday.format(day.date)}
              </span>
              <DateButton
                day={{ ...day, inMonth: true }}
                formats={formats}
                onOpenDay={onOpenDay}
                xstyle={styles.popoverDate}
              />
            </div>
            <div {...stylex.props(styles.popoverEvents)}>
              {segmentsOn(segments, column).map((segment) => {
                const fragment = fragmentOn(segment, column);
                return (
                  <MonthEvent
                    key={eventKey(segment)}
                    bar={isBarFragment(fragment)}
                    color={getEventColor?.(segment.event.event)}
                    icon={getEventIcon?.(segment.event.event)}
                    date={day.date}
                    endsAfter={fragment.endsAfterDay}
                    event={segment.event}
                    focusTarget={false}
                    labelEvent={labelEvent}
                    startsBefore={fragment.startsBeforeDay}
                    time={startTime(fragment, formats)}
                    xstyle={styles.listed}
                  />
                );
              })}
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

/**
 * A day of the grid and its keyboard focus target. Its date (`data-date`, which pointer
 * hit-testing reads) sits under the event segments, and shows a keyboard create's range. A day
 * outside the calendar's working hours is muted, and its name says why.
 */
function MonthDayCell({
  children,
  closed,
  count,
  day,
  formats,
  offscreen,
  onOpenDay,
  renderUnavailable,
}: {
  readonly children: ReactNode;
  /** Set when the day has no working hours, with whether the days beside it in the week do. */
  readonly closed: ClosedDay | undefined;
  /** Events on the day, including those behind "+N more". */
  readonly count: number;
  readonly day: MonthDay;
  readonly formats: MonthFormats;
  /** Not a focus target, in a week rendered beside the visible ones. */
  readonly offscreen: boolean;
  readonly onOpenDay: (date: Temporal.PlainDate) => void;
  readonly renderUnavailable?: UnavailableTimeRender;
}) {
  const roving = useRovingFocus({ date: day.date, kind: "day" });
  const inDraft = useCalendarInteraction((session) => inAllDayDraft(session, day.date));
  const draftCheck = useDraftCheck();

  return (
    <div
      role="gridcell"
      aria-label={dayCellLabel(formats, day.date, closed, count)}
      // Out of the tab order, yet focusable, so focus on it survives a scroll that moves it away.
      {...(offscreen ? { tabIndex: -1 } : roving)}
      onKeyDown={(event) => {
        // Shift+Enter opens the day, as clicking its date does.
        if (event.key === "Enter" && event.shiftKey && event.target === event.currentTarget) {
          event.preventDefault();
          onOpenDay(day.date);
        }
      }}
      {...stylex.props(styles.cell)}
    >
      {closed !== undefined && (
        <UnavailableTime
          band={closed}
          date={day.date}
          end={1}
          render={renderUnavailable}
          resource={null}
          slot="month-closed"
          start={0}
          xstyle={styles.closed}
        />
      )}
      {/* Events sit outside this element, so a drop target is never the cell a bar starts in. */}
      <div
        data-closed={closed === undefined ? undefined : ""}
        data-date={day.date.toString()}
        data-draft={inDraft ? "" : undefined}
        {...previewCheckAttributes(inDraft ? draftCheck : undefined)}
        {...stylex.props(styles.day, !day.inMonth && closed === undefined && styles.dayOutside)}
      >
        <DateButton
          day={day}
          formats={formats}
          onOpenDay={onOpenDay}
          tabIndex={-1}
          xstyle={styles.cellDate}
        />
      </div>
      {children}
    </div>
  );
}

/**
 * One week as a grid row of day cells. A cell holds the event segments that start on it and its
 * "+N more" control; a segment spanning several days stretches over the cells that follow.
 */
export function MonthWeekRow<TEvent>({
  expanded,
  formats,
  getEventColor,
  getEventIcon,
  labelEvent,
  maxLanes,
  offscreen = false,
  onOpenDay,
  overflow,
  renderUnavailable,
  week,
}: MonthWeekRowProps<TEvent>) {
  const segments = expanded ? week.segments : overflow.segments;
  const closedDates = useClosedDates(week.range);
  const closed = closedDaysOf(week, closedDates);

  return (
    <div role="row" {...stylex.props(styles.row)}>
      {week.days.map((day, column) => (
        <MonthDayCell
          key={day.date.toString()}
          closed={closed[column]}
          count={segmentsOn(week.segments, column).length}
          day={day}
          formats={formats}
          offscreen={offscreen}
          onOpenDay={onOpenDay}
          renderUnavailable={renderUnavailable}
        >
          {segmentsStartingOn(segments, column).map((segment) => (
            <MonthEvent
              key={eventKey(segment)}
              bar={isBarSegment(segment)}
              color={getEventColor?.(segment.event.event)}
              icon={getEventIcon?.(segment.event.event)}
              date={day.date}
              days={segment.span}
              endsAfter={segment.endsAfter}
              event={segment.event}
              labelEvent={labelEvent}
              offscreen={offscreen}
              startsBefore={segment.startsBefore}
              style={laneBox(segment.lane, segment.span)}
              time={startTime(segment.fragments[0]!, formats)}
              xstyle={[
                styles.segment,
                segment.startsBefore && styles.segmentContinued,
                segment.endsAfter && styles.segmentContinues,
              ]}
            />
          ))}
          {!expanded && overflow.hiddenCounts[column]! > 0 && (
            <MoreEvents
              column={column}
              count={overflow.hiddenCounts[column]!}
              day={day}
              formats={formats}
              getEventColor={getEventColor}
              getEventIcon={getEventIcon}
              labelEvent={labelEvent}
              lane={maxLanes - 1}
              onOpenDay={onOpenDay}
              segments={week.segments}
            />
          )}
        </MonthDayCell>
      ))}
    </div>
  );
}
