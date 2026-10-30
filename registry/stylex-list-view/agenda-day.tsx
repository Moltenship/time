"use client";

import * as stylex from "@stylexjs/stylex";
import { memo, type ComponentProps, type ReactNode } from "react";

import type { EventLabeler } from "@registry/stylex-calendar/event-label";
import { calendarVars } from "@registry/stylex-calendar-theme/calendar-tokens.stylex";
import type { CalendarEventColor } from "@registry/stylex-calendar-theme/event-colors";
import { type XStyle, xprops } from "@registry/stylex-calendar-theme/xprops";

import { AgendaItem } from "./agenda-item";
import type { AgendaDay as AgendaDayData } from "./agenda-rows";

const styles = stylex.create({
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
    fontSize: "1.125rem",
    fontVariantNumeric: "tabular-nums",
    height: "2.25rem",
    justifyContent: "center",
    lineHeight: "1.75rem",
    outlineColor: { default: null, ":focus-visible": calendarVars["--ring"] },
    outlineOffset: { default: null, ":focus-visible": 1 },
    outlineStyle: { default: null, ":focus-visible": "solid" },
    outlineWidth: { default: null, ":focus-visible": 2 },
    padding: 0,
    width: "2.25rem",
  },
  dateColumn: {
    alignItems: "center",
    alignSelf: "flex-start",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    gap: "0.125rem",
    paddingTop: "0.25rem",
    position: "sticky",
    top: 0,
    width: "3rem",
  },
  dateToday: {
    backgroundColor: {
      default: calendarVars["--calendar-today"],
      ":hover": `color-mix(in oklch, ${calendarVars["--calendar-today"]} 90%, transparent)`,
    },
    color: calendarVars["--calendar-today-foreground"],
  },
  day: {
    display: "flex",
    gap: { default: "0.75rem", "@media (min-width: 640px)": "1.5rem" },
    paddingBlock: "0.5rem",
    paddingInline: { default: "0.75rem", "@media (min-width: 640px)": "1.5rem" },
  },
  events: {
    display: "flex",
    flex: "1 1 0%",
    flexDirection: "column",
    gap: "0.125rem",
    listStyleType: "none",
    marginBlock: 0,
    minWidth: 0,
    paddingBlock: "0.25rem",
    paddingInline: 0,
  },
  weekday: {
    color: calendarVars["--muted-foreground"],
    fontSize: "0.6875rem",
    fontWeight: 500,
    textTransform: "uppercase",
  },
  weekdayToday: {
    color: calendarVars["--calendar-today"],
  },
});

export interface AgendaFormats {
  readonly date: Intl.DateTimeFormat;
  readonly range: Intl.DateTimeFormat;
  readonly time: Intl.DateTimeFormat;
  readonly weekday: Intl.DateTimeFormat;
}

export interface AgendaDayProps<TEvent> extends Omit<ComponentProps<"li">, "children"> {
  readonly day: AgendaDayData<TEvent>;
  readonly formats: AgendaFormats;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor;
  /** An icon before an event's title, or nothing. */
  readonly getEventIcon?: (event: TEvent) => ReactNode;
  readonly labelEvent: EventLabeler<TEvent>;
  /** Opens a day: its date's button does, and Shift+Enter on one of its events. */
  readonly onOpenDay: (date: Temporal.PlainDate) => void;
  /** Styles the list adds, after the day's own. */
  readonly xstyle?: XStyle;
}

type AgendaDayContentProps<TEvent> = Pick<
  AgendaDayProps<TEvent>,
  "day" | "formats" | "getEventColor" | "getEventIcon" | "labelEvent" | "onOpenDay"
>;

/** One day of the agenda: its date, which stays in view while its events scroll past, then them. */
export function AgendaDay<TEvent>({
  className,
  day,
  formats,
  getEventColor,
  getEventIcon,
  labelEvent,
  onOpenDay,
  style,
  xstyle,
  ...props
}: AgendaDayProps<TEvent>) {
  return (
    <li
      data-date={day.date.toString()}
      {...props}
      {...xprops({ className, style }, styles.day, xstyle)}
    >
      <AgendaDayContent
        day={day}
        formats={formats}
        getEventColor={getEventColor}
        getEventIcon={getEventIcon}
        labelEvent={labelEvent}
        onOpenDay={onOpenDay}
      />
    </li>
  );
}

function AgendaDayContentBase<TEvent>({
  day,
  formats,
  getEventColor,
  getEventIcon,
  labelEvent,
  onOpenDay,
}: AgendaDayContentProps<TEvent>) {
  return (
    <>
      {/* Sticks to the top while the day's events scroll past. */}
      <div {...stylex.props(styles.dateColumn)}>
        <span {...stylex.props(styles.weekday, day.isToday && styles.weekdayToday)}>
          {formats.weekday.format(day.date)}
        </span>
        <button
          type="button"
          aria-current={day.isToday ? "date" : undefined}
          aria-label={formats.date.format(day.date)}
          onClick={() => onOpenDay(day.date)}
          // The list keeps one tab stop; Shift+Enter on an event opens its day.
          tabIndex={-1}
          {...stylex.props(styles.date, day.isToday && styles.dateToday)}
        >
          {day.date.day}
        </button>
      </div>
      <ul {...stylex.props(styles.events)}>
        {day.items.map((item) => (
          // `typeof` keeps numeric 1 and string "1" apart; they are distinct event IDs.
          <li key={`${typeof item.event.id}:${item.event.id}`}>
            <AgendaItem
              color={getEventColor?.(item.event.event)}
              icon={getEventIcon?.(item.event.event)}
              item={item}
              labelEvent={labelEvent}
              onOpenDay={onOpenDay}
              timeFormat={formats.time}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * A day's date and events. The virtualizer renders the list again whenever it scrolls or measures
 * a row, which only moves the day: its events, and the dates and times they format, render again
 * only when their props change.
 */
const AgendaDayContent = memo(AgendaDayContentBase) as typeof AgendaDayContentBase;
