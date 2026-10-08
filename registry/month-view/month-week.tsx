import {
  limitDayGridLanes,
  type DayGridSegment,
  type EventDayFragment,
  type EventId,
  type MonthDay,
  type MonthWeek,
  type ResourceId,
} from "@moltenship/calendar";
import { useMemo, type CSSProperties } from "react";

import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import { cn } from "@registry/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@registry/ui/popover";

import { MonthEvent } from "./month-event";

/** Pixel height of a cell's date row and of one event lane; lanes are derived from these. */
export const DATE_ROW_HEIGHT = 28;
export const LANE_HEIGHT = 22;

export interface MonthFormats {
  readonly date: Intl.DateTimeFormat;
  readonly monthDay: Intl.DateTimeFormat;
  readonly time: (time: Temporal.PlainTime) => string;
  readonly weekday: Intl.DateTimeFormat;
}

interface MonthWeekRowProps<TEvent> {
  readonly formats: MonthFormats;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor;
  /** Lanes that fit in a cell, including the one a "+N more" control takes. */
  readonly maxLanes: number;
  readonly onOpenDay: (date: Temporal.PlainDate) => void;
  readonly week: MonthWeek<TEvent, EventId, ResourceId>;
}

type Segment<TEvent> = DayGridSegment<TEvent, EventId, ResourceId>;

function startTime(
  fragment: EventDayFragment<unknown, EventId, ResourceId>,
  formats: MonthFormats,
) {
  return fragment.event.kind === "all-day" || fragment.startsBeforeDay
    ? undefined
    : formats.time(fragment.start.toPlainTime());
}

function DateButton({
  className,
  day,
  formats,
  onOpenDay,
}: {
  readonly className?: string;
  readonly day: MonthDay;
  readonly formats: MonthFormats;
  readonly onOpenDay: (date: Temporal.PlainDate) => void;
}) {
  return (
    <button
      type="button"
      aria-current={day.isToday ? "date" : undefined}
      aria-label={formats.date.format(day.date)}
      onClick={() => onOpenDay(day.date)}
      className={cn(
        "flex items-center justify-center rounded-full font-medium tabular-nums outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50",
        !day.inMonth && "text-muted-foreground",
        day.isToday &&
          "bg-calendar-today text-calendar-today-foreground hover:bg-calendar-today/90",
        className,
      )}
    >
      {day.date.day === 1 ? formats.monthDay.format(day.date) : day.date.day}
    </button>
  );
}

function MoreEvents<TEvent>({
  column,
  count,
  day,
  formats,
  getEventColor,
  onOpenDay,
  segments,
  style,
}: {
  readonly column: number;
  readonly count: number;
  readonly day: MonthDay;
  readonly formats: MonthFormats;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor;
  readonly onOpenDay: (date: Temporal.PlainDate) => void;
  readonly segments: readonly Segment<TEvent>[];
  readonly style: CSSProperties;
}) {
  // Lanes are assigned in display order, so the day's events read top to bottom by lane.
  const dayEvents = segments
    .filter((segment) => segment.column <= column && column < segment.column + segment.span)
    .toSorted((left, right) => left.lane - right.lane);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${count} more events on ${formats.date.format(day.date)}`}
          style={style}
          className="pointer-events-auto mx-0.5 my-px truncate rounded-sm px-1.5 text-left text-xs font-medium max-sm:px-1 max-sm:text-[0.625rem] text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <span className="max-sm:hidden">{count} more</span>
          <span className="sm:hidden">+{count}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        collisionPadding={8}
        className="flex max-h-(--radix-popover-content-available-height) w-64 flex-col p-2"
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
        <div className="-mx-2 flex min-h-0 flex-col gap-0.5 overflow-y-auto px-2">
          {dayEvents.map((segment) => {
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
                endsAfter={fragment.endsAfterDay}
                event={segment.event}
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

/** One week: day cells (`data-date`) underneath, event lanes and "+N more" controls on top. */
export function MonthWeekRow<TEvent>({
  formats,
  getEventColor,
  maxLanes,
  onOpenDay,
  week,
}: MonthWeekRowProps<TEvent>) {
  const { hiddenCounts, segments } = useMemo(
    () => limitDayGridLanes(week, maxLanes),
    [week, maxLanes],
  );

  return (
    <div className="relative min-h-0 border-b border-calendar-grid last:border-b-0">
      <div className="absolute inset-0 grid grid-cols-7">
        {week.days.map((day) => (
          <div
            key={day.date.toString()}
            data-date={day.date.toString()}
            className={cn(
              "flex min-w-0 justify-center border-r border-calendar-grid last:border-r-0",
              !day.inMonth && "bg-muted/50",
            )}
          >
            <DateButton
              className="mt-1 h-6 min-w-6 px-1.5 text-xs"
              day={day}
              formats={formats}
              onOpenDay={onOpenDay}
            />
          </div>
        ))}
      </div>
      <div
        className="pointer-events-none absolute inset-x-0 grid grid-cols-7"
        style={{ gridAutoRows: LANE_HEIGHT, top: DATE_ROW_HEIGHT }}
      >
        {segments.map((segment) => (
          <MonthEvent
            // `typeof` keeps numeric 1 and string "1" apart; they are distinct event IDs.
            key={`${typeof segment.event.id}:${segment.event.id}@${segment.column}`}
            bar={
              segment.event.kind === "all-day" ||
              segment.span > 1 ||
              segment.startsBefore ||
              segment.endsAfter
            }
            className={cn(
              "pointer-events-auto mx-0.5 my-px",
              segment.startsBefore && "ml-0",
              segment.endsAfter && "mr-0",
            )}
            color={getEventColor?.(segment.event.event)}
            endsAfter={segment.endsAfter}
            event={segment.event}
            startsBefore={segment.startsBefore}
            style={{
              gridColumn: `${segment.column + 1} / span ${segment.span}`,
              gridRow: segment.lane + 1,
            }}
            time={startTime(segment.fragments[0]!, formats)}
          />
        ))}
        {hiddenCounts.map(
          (count, column) =>
            count > 0 && (
              <MoreEvents
                key={column}
                column={column}
                count={count}
                day={week.days[column]!}
                formats={formats}
                getEventColor={getEventColor}
                onOpenDay={onOpenDay}
                segments={week.segments}
                style={{ gridColumn: column + 1, gridRow: maxLanes }}
              />
            ),
        )}
      </div>
    </div>
  );
}
