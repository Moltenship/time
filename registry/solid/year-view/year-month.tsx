import {
  useClosedDates,
  useRovingFocus,
  type ClosedDate,
  type EventId,
  type ResourceId,
  type YearDay,
  type YearMonth,
} from "@moltenship/calendar-solid";
import { createMemo, For, Show } from "solid-js";

import { UnavailableTime, type UnavailableTimeRender } from "@registry/calendar/unavailable-time";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import {
  closedDaysOf,
  dotColors,
  weekdaysOf,
  type YearClosedDays,
  type YearShade,
} from "@registry/shared/year-view/year-layout";
import { dayCellLabel, type YearFormats } from "@registry/shared/year-view/year-labels";
import {
  yearClosedClass,
  yearDateClass,
  yearDayButtonClass,
  yearDayCellClass,
  yearDotClass,
  yearDotsClass,
  yearGridClass,
  yearMonthClass,
  yearMonthNameClass,
  yearWeekClass,
  yearWeekdayClass,
  yearWeekdayRowClass,
  yearWeeksClass,
} from "@registry/shared/year-view/year.styles";
import { PopoverTrigger, type PopoverHandle } from "@registry/calendar-ui/popover";

export type { YearClosedDays } from "@registry/shared/year-view/year-layout";
export type { YearFormats } from "@registry/shared/year-view/year-labels";

/** Opens the day popover; the popover reads the day's events from the current projection. */
export type YearDayPopoverHandle = PopoverHandle<Temporal.PlainDate>;

interface YearDayCellProps<TEvent> {
  /** Set when the day has no working hours. */
  readonly closed: ClosedDate | undefined;
  readonly day: YearDay<TEvent, EventId, ResourceId>;
  readonly formats: YearFormats;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor;
  readonly handle: YearDayPopoverHandle;
  readonly onOpenDay: (date: Temporal.PlainDate) => void;
  readonly renderUnavailable?: UnavailableTimeRender;
  /** Set when the view shades this closed day. */
  readonly shade: YearShade | undefined;
  readonly triggerId: string;
}

/**
 * A day of the year and its keyboard focus target: the date, today in a filled circle, and a
 * dot for each event colour on it. Clicking it, Enter or Space opens the day's events in a
 * popover; Shift+Enter opens the day. A closed day's name says why, and a shaded one joins the
 * shaded days beside it in a band.
 */
function YearDayCell<TEvent>(props: YearDayCellProps<TEvent>) {
  const roving = useRovingFocus(() => ({ date: props.day.date, kind: "day" }));
  // Native, so it runs before the view's keyboard, which listens on the view.
  const dayKeys = (element: HTMLElement) => {
    element.addEventListener("keydown", (event) => {
      if (event.target !== event.currentTarget) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      // Handled here, so the view's keyboard doesn't start an event on the day.
      event.preventDefault();
      if (event.key === "Enter" && event.shiftKey) props.onOpenDay(props.day.date);
      else props.handle.open(props.triggerId);
    });
  };

  return (
    <div
      role="gridcell"
      aria-current={props.day.isToday ? "date" : undefined}
      aria-haspopup="dialog"
      aria-label={dayCellLabel(
        props.formats,
        props.day.date,
        props.closed,
        props.day.fragments.length,
      )}
      data-closed={props.closed === undefined ? undefined : ""}
      data-date={props.day.date.toString()}
      ref={[roving.ref, dayKeys]}
      onFocus={roving.onFocus}
      tabindex={roving.tabindex}
      class={yearDayCellClass}
    >
      <Show when={props.shade}>
        {(shade) => (
          <UnavailableTime
            band={shade().band}
            class={yearClosedClass(shade())}
            date={props.day.date}
            end={1}
            render={props.renderUnavailable}
            resource={null}
            slot="year-closed"
            start={0}
          />
        )}
      </Show>
      <PopoverTrigger
        handle={props.handle}
        id={props.triggerId}
        payload={props.day.date}
        aria-label={props.formats.date.format(props.day.date)}
        // A click opens the popover without focusing this button: keys belong to the cell around
        // it, the view's one tab stop, where the popover returns focus.
        onMouseDown={(event) => event.preventDefault()}
        tabIndex={-1}
        class={yearDayButtonClass}
      >
        <span class={yearDateClass(props.day.isToday)}>{props.day.date.day}</span>
        <span aria-hidden="true" class={yearDotsClass}>
          {/* Colours are unique per day, the theme's default among them. */}
          <For
            each={dotColors(props.day.fragments, props.getEventColor)}
            keyed={(color) => color ?? "default"}
          >
            {(color) => (
              <span data-color={color()} data-slot="year-event-dot" class={yearDotClass} />
            )}
          </For>
        </span>
      </PopoverTrigger>
    </div>
  );
}

export interface YearMonthGridProps<TEvent> {
  readonly formats: YearFormats;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor;
  readonly handle: YearDayPopoverHandle;
  readonly month: YearMonth<TEvent, EventId, ResourceId>;
  readonly onOpenDay: (date: Temporal.PlainDate) => void;
  readonly onOpenMonth: (date: Temporal.PlainDate) => void;
  readonly renderUnavailable?: UnavailableTimeRender;
  /** Which closed days to shade. */
  readonly shadeClosedDays: YearClosedDays;
  /** The ID of the popover trigger for a date. */
  readonly triggerId: (date: Temporal.PlainDate) => string;
}

/**
 * One month of the year: its name, which opens the month, weekday initials, and a grid of its
 * weeks. Every month keeps room for six weeks, so months side by side line up.
 */
export function YearMonthGrid<TEvent>(props: YearMonthGridProps<TEvent>) {
  const first = () => props.month.range.start;
  const label = () => props.formats.monthYear.format(first());
  const closed = useClosedDates(() => props.month.range);
  const weeks = createMemo(() =>
    props.month.weeks.map((week) => ({
      closed: closedDaysOf(week, closed(), props.shadeClosedDays),
      week,
    })),
  );

  return (
    <div
      data-month={first().toPlainYearMonth().toString()}
      data-slot="year-month"
      class={yearMonthClass}
    >
      <button
        type="button"
        aria-label={label()}
        onClick={() => props.onOpenMonth(first())}
        // Keys move through the days; the view switcher reaches the month too.
        tabindex={-1}
        class={yearMonthNameClass}
      >
        {props.formats.month.format(first())}
      </button>
      <div role="grid" aria-label={label()} class={yearGridClass}>
        <div role="row" class={yearWeekdayRowClass}>
          <For each={weekdaysOf(props.month)} keyed={(date) => date.dayOfWeek}>
            {(date) => (
              <div
                role="columnheader"
                aria-label={props.formats.weekdayName.format(date())}
                class={yearWeekdayClass}
              >
                {props.formats.weekday.format(date())}
              </div>
            )}
          </For>
        </div>
        <div class={yearWeeksClass}>
          <For each={weeks()} keyed={({ week }) => week.range.start.toString()}>
            {(row) => (
              <div role="row" class={yearWeekClass}>
                {/* By date, as React keys them: a new projection has new day objects. */}
                <For
                  each={row().week.days.map((day, column) => ({ column, day }))}
                  keyed={({ column, day }) => day?.date.toString() ?? `empty-${column}`}
                >
                  {(cell) => (
                    <Show
                      when={cell().day}
                      // Keeps the columns in step for screen readers; the date shows in its own
                      // month.
                      fallback={<div role="gridcell" />}
                    >
                      {(day) => (
                        <YearDayCell
                          closed={row().closed[cell().column]!.closed}
                          day={day()}
                          formats={props.formats}
                          getEventColor={props.getEventColor}
                          handle={props.handle}
                          onOpenDay={props.onOpenDay}
                          renderUnavailable={props.renderUnavailable}
                          shade={row().closed[cell().column]!.shade}
                          triggerId={props.triggerId(day().date)}
                        />
                      )}
                    </Show>
                  )}
                </For>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}
