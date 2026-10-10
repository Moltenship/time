import {
  useCalendarInteraction,
  useRovingFocus,
  type DayGridOverflow,
  type DayGridSegment,
  type EventDayFragment,
  type EventId,
  type MonthDay,
  type MonthWeek,
  type ResourceId,
} from "@moltenship/calendar";
import type { CSSProperties, ReactNode } from "react";

import type { EventLabeler } from "@registry/calendar/event-label";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import { cn } from "cn";
import { Popover, PopoverContent, PopoverTrigger } from "@registry/ui/popover";

import { MonthEvent } from "./month-event";

/** Pixel height of a cell's date row and of one event lane; lanes are derived from these. */
export const DATE_ROW_HEIGHT = 28;
export const LANE_HEIGHT = 22;

export interface MonthFormats {
  readonly date: Intl.DateTimeFormat;
  /** A month's first date, named with the short month it shows: "Thursday, Oct 1, 2026". */
  readonly firstDate: Intl.DateTimeFormat;
  readonly monthDay: Intl.DateTimeFormat;
  readonly time: (time: Temporal.PlainTime) => string;
  readonly weekday: Intl.DateTimeFormat;
  readonly weekdayName: Intl.DateTimeFormat;
}

interface MonthWeekRowProps<TEvent> {
  readonly formats: MonthFormats;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor;
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
  readonly week: MonthWeek<TEvent, EventId, ResourceId>;
}

type Segment<TEvent> = DayGridSegment<TEvent, EventId, ResourceId>;

/**
 * Places an item in a lane of its first day's cell. A span reaches across the following cells:
 * `100%` is one cell without its 1px grid line.
 */
function laneStyle(lane: number, span = 1): CSSProperties {
  return {
    height: LANE_HEIGHT - 2,
    insetInlineEnd: `calc(${1 - span} * (100% + 1px))`,
    top: DATE_ROW_HEIGHT + lane * LANE_HEIGHT + 1,
  };
}

function startTime(
  fragment: EventDayFragment<unknown, EventId, ResourceId>,
  formats: MonthFormats,
) {
  return fragment.event.kind === "all-day" || fragment.startsBeforeDay
    ? undefined
    : formats.time(fragment.start.toPlainTime());
}

/** The segments that show something on a week's `column`, top to bottom. */
function segmentsOn<TEvent>(segments: readonly Segment<TEvent>[], column: number) {
  // Lanes are assigned in display order, so the day's events read top to bottom by lane.
  return segments
    .filter((segment) => segment.column <= column && column < segment.column + segment.span)
    .toSorted((left, right) => left.lane - right.lane);
}

function eventCount(count: number): string {
  return count === 0 ? "no events" : count === 1 ? "1 event" : `${count} events`;
}

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
  const first = day.date.day === 1;
  return (
    <button
      type="button"
      aria-current={day.isToday ? "date" : undefined}
      aria-label={(first ? formats.firstDate : formats.date).format(day.date)}
      onClick={() => onOpenDay(day.date)}
      tabIndex={tabIndex}
      className={cn(
        "flex items-center justify-center rounded-full font-medium tabular-nums hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
        !day.inMonth && "text-muted-foreground",
        day.isToday &&
          "bg-calendar-today text-calendar-today-foreground hover:bg-calendar-today/90",
        className,
      )}
    >
      {first ? formats.monthDay.format(day.date) : day.date.day}
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
  readonly labelEvent: EventLabeler<TEvent>;
  readonly lane: number;
  readonly onOpenDay: (date: Temporal.PlainDate) => void;
  readonly segments: readonly Segment<TEvent>[];
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`${count} more events on ${formats.date.format(day.date)}`}
        // The view keeps one tab stop; arrow keys reach these events in the grid.
        tabIndex={-1}
        style={laneStyle(lane)}
        className="absolute start-0 z-1 mx-0.5 truncate rounded-sm px-1.5 text-start text-xs font-medium max-sm:px-1 max-sm:text-[0.625rem] text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
      >
        <span className="max-sm:hidden">{count} more</span>
        <span className="sm:hidden">+{count}</span>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        aria-label={`Events on ${formats.date.format(day.date)}`}
        className="max-h-(--available-height) w-64 gap-0 p-2"
      >
        <div className="flex flex-col items-center gap-0.5 pb-2">
          <span className="text-[0.6875rem] font-medium text-muted-foreground uppercase">
            {formats.weekday.format(day.date)}
          </span>
          <DateButton
            className="size-10 text-xl font-normal"
            day={{ ...day, inMonth: true }}
            formats={formats}
            onOpenDay={onOpenDay}
          />
        </div>
        <div className="-mx-2 flex min-h-0 flex-col gap-0.5 overflow-y-auto px-2 py-1">
          {segmentsOn(segments, column).map((segment) => {
            const fragment = segment.fragments[column - segment.column]!;
            return (
              <MonthEvent
                key={`${typeof segment.event.id}:${segment.event.id}`}
                bar={
                  segment.event.kind === "all-day" ||
                  fragment.startsBeforeDay ||
                  fragment.endsAfterDay
                }
                className="h-6 shrink-0"
                color={getEventColor?.(segment.event.event)}
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
 * hit-testing reads) sits under the event segments, and shows a keyboard create's range.
 */
function MonthDayCell({
  children,
  count,
  day,
  formats,
  offscreen,
  onOpenDay,
}: {
  readonly children: ReactNode;
  /** Events on the day, including those behind "+N more". */
  readonly count: number;
  readonly day: MonthDay;
  readonly formats: MonthFormats;
  /** Not a focus target, in a week rendered beside the visible ones. */
  readonly offscreen: boolean;
  readonly onOpenDay: (date: Temporal.PlainDate) => void;
}) {
  const roving = useRovingFocus({ date: day.date, kind: "day" });
  const inDraft = useCalendarInteraction(
    (session) =>
      session?.eventId === null &&
      session.proposed.kind === "all-day" &&
      Temporal.PlainDate.compare(session.proposed.start, day.date) <= 0 &&
      Temporal.PlainDate.compare(day.date, session.proposed.end) < 0,
  );

  return (
    <div
      role="gridcell"
      aria-label={`${formats.date.format(day.date)}, ${eventCount(count)}`}
      // Out of the tab order, yet focusable, so focus on it survives a scroll that moves it away.
      {...(offscreen ? { tabIndex: -1 } : roving)}
      onKeyDown={(event) => {
        // Shift+Enter opens the day, as clicking its date does.
        if (event.key === "Enter" && event.shiftKey && event.target === event.currentTarget) {
          event.preventDefault();
          onOpenDay(day.date);
        }
      }}
      className="relative min-w-0 border-e border-calendar-grid last:border-e-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
    >
      {/* Events sit outside this element, so a drop target is never the cell a bar starts in. */}
      <div
        data-date={day.date.toString()}
        data-draft={inDraft ? "" : undefined}
        className={cn(
          "absolute inset-0 flex justify-center data-draft:bg-calendar-selection",
          !day.inMonth && "bg-muted/50",
        )}
      >
        <DateButton
          className="mt-1 h-6 min-w-6 px-1.5 text-xs"
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
  labelEvent,
  maxLanes,
  offscreen = false,
  onOpenDay,
  overflow,
  week,
}: MonthWeekRowProps<TEvent>) {
  const segments = expanded ? week.segments : overflow.segments;

  return (
    <div
      role="row"
      className="grid min-h-0 grid-cols-7 border-b border-calendar-grid last:border-b-0"
    >
      {week.days.map((day, column) => (
        <MonthDayCell
          key={day.date.toString()}
          count={segmentsOn(week.segments, column).length}
          day={day}
          formats={formats}
          offscreen={offscreen}
          onOpenDay={onOpenDay}
        >
          {segments
            .filter((segment) => segment.column === column)
            .map((segment) => (
              <MonthEvent
                // `typeof` keeps numeric 1 and string "1" apart; they are distinct event IDs.
                key={`${typeof segment.event.id}:${segment.event.id}`}
                bar={
                  segment.event.kind === "all-day" ||
                  segment.span > 1 ||
                  segment.startsBefore ||
                  segment.endsAfter
                }
                className={cn(
                  "absolute start-0 z-1 mx-0.5",
                  segment.startsBefore && "ms-0",
                  segment.endsAfter && "me-0",
                )}
                color={getEventColor?.(segment.event.event)}
                date={day.date}
                days={segment.span}
                endsAfter={segment.endsAfter}
                event={segment.event}
                labelEvent={labelEvent}
                offscreen={offscreen}
                startsBefore={segment.startsBefore}
                style={laneStyle(segment.lane, segment.span)}
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
