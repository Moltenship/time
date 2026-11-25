"use client";

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
import type { ReactNode, Ref } from "react";

import type { EventLabeler } from "@registry/calendar/event-label";
import {
  draftCheckClassName,
  previewCheckAttributes,
  useDraftCheck,
} from "@registry/calendar/preview-check";
import { UnavailableTime, type UnavailableTimeRender } from "@registry/calendar/unavailable-time";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
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
import {
  laneProbeClass,
  monthCellDateClass,
  monthClosedClass,
  monthDateButtonClass,
  monthDateLayerClass,
  monthDayCellClass,
  monthListDateClass,
  monthSegmentClass,
  monthWeekClass,
  moreEventsContentClass,
  moreEventsHeaderClass,
  moreEventsItemClass,
  moreEventsListClass,
  moreEventsLongClass,
  moreEventsShortClass,
  moreEventsTriggerClass,
  moreEventsWeekdayClass,
} from "@registry/shared/month-view/month.styles";
import { Popover, PopoverContent, PopoverTrigger } from "@registry/calendar-ui/popover";

import { MonthEvent } from "./month-event";

export {
  DATE_ROW_HEIGHT,
  LANE_HEIGHT,
  laneHeightOf,
  lanesIn,
  weekHeight,
} from "@registry/shared/month-view/month-layout";
export type { MonthFormats } from "@registry/shared/month-view/month-labels";

/**
 * An invisible element one lane tall, for measuring `--calendar-month-lane` in any unit. Observe
 * it with the rows: it resizes when the pointer changes, and the lanes with it.
 */
export function LaneProbe({ ref }: { readonly ref: Ref<HTMLDivElement> }) {
  return <div ref={ref} aria-hidden className={laneProbeClass} />;
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
}: {
  readonly className?: string;
  readonly day: MonthDay;
  readonly formats: MonthFormats;
  readonly onOpenDay: (date: Temporal.PlainDate) => void;
  readonly tabIndex?: number;
}) {
  return (
    <button
      type="button"
      aria-current={day.isToday ? "date" : undefined}
      aria-label={dateButtonLabel(formats, day.date)}
      onClick={() => onOpenDay(day.date)}
      tabIndex={tabIndex}
      className={monthDateButtonClass(day, className)}
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
    <Popover>
      <PopoverTrigger
        aria-label={moreEventsLabel(formats, day.date, count)}
        // The view keeps one tab stop; arrow keys reach these events in the grid.
        tabIndex={-1}
        style={laneBox(lane)}
        className={moreEventsTriggerClass}
      >
        <span className={moreEventsLongClass}>{text.long}</span>
        <span className={moreEventsShortClass}>{text.short}</span>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        aria-label={dayEventsLabel(formats, day.date)}
        className={moreEventsContentClass}
      >
        <div className={moreEventsHeaderClass}>
          <span className={moreEventsWeekdayClass}>{formats.weekday.format(day.date)}</span>
          <DateButton
            className={monthListDateClass}
            day={{ ...day, inMonth: true }}
            formats={formats}
            onOpenDay={onOpenDay}
          />
        </div>
        <div className={moreEventsListClass}>
          {segmentsOn(segments, column).map((segment) => {
            const fragment = fragmentOn(segment, column);
            return (
              <MonthEvent
                key={eventKey(segment)}
                bar={isBarFragment(fragment)}
                className={moreEventsItemClass}
                color={getEventColor?.(segment.event.event)}
                icon={getEventIcon?.(segment.event.event)}
                date={day.date}
                endsAfter={fragment.endsAfterDay}
                event={segment.event}
                focusTarget={false}
                labelEvent={labelEvent}
                startsBefore={fragment.startsBeforeDay}
                time={startTime(fragment, formats)}
              />
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
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
      className={monthDayCellClass}
    >
      {closed !== undefined && (
        <UnavailableTime
          band={closed}
          className={monthClosedClass}
          date={day.date}
          end={1}
          render={renderUnavailable}
          resource={null}
          slot="month-closed"
          start={0}
        />
      )}
      {/* Events sit outside this element, so a drop target is never the cell a bar starts in. */}
      <div
        data-closed={closed === undefined ? undefined : ""}
        data-date={day.date.toString()}
        data-draft={inDraft ? "" : undefined}
        {...previewCheckAttributes(inDraft ? draftCheck : undefined)}
        className={monthDateLayerClass(day.inMonth, closed !== undefined, draftCheckClassName)}
      >
        <DateButton
          className={monthCellDateClass}
          day={day}
          formats={formats}
          onOpenDay={onOpenDay}
          tabIndex={-1}
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
    <div role="row" className={monthWeekClass}>
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
              className={monthSegmentClass(segment.startsBefore, segment.endsAfter)}
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
