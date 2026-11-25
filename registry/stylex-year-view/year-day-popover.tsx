"use client";

import type { EventDayFragment, EventId, ResourceId, YearDay } from "@moltenship/calendar";
import * as stylex from "@stylexjs/stylex";
import { useRef, type ReactNode, type RefObject } from "react";

import { EventChip, EventIcon, useEventChip } from "@registry/stylex-calendar/event-chip";
import type { EventLabeler } from "@registry/stylex-calendar/event-label";
import {
  calendarMarker,
  calendarVars,
} from "@registry/stylex-calendar-theme/calendar-tokens.stylex";
import type { CalendarEventColor } from "@registry/stylex-calendar-theme/event-colors";
import { Popover, PopoverContent } from "@registry/stylex-calendar-ui/popover";

import type { YearDayPopoverHandle, YearFormats } from "./year-month";

const styles = stylex.create({
  chip: {
    borderRadius: "calc(var(--radius) * 0.6)",
    flexShrink: 0,
    gap: "0.25rem",
    height: "1.5rem",
    paddingBlock: 0,
    paddingInline: "0.375rem",
  },
  chipItem: {
    backgroundColor: { default: "transparent", ":hover": calendarVars["--accent"] },
    borderInlineStartWidth: 0,
    color: calendarVars["--foreground"],
    fontWeight: 400,
    filter: { default: null, ":hover": "brightness(1)" },
  },
  date: {
    alignItems: "center",
    appearance: "none",
    backgroundColor: { default: "transparent", ":hover": calendarVars["--accent"] },
    borderRadius: "9999px",
    borderWidth: 0,
    color: "inherit",
    display: "flex",
    fontFamily: "inherit",
    fontSize: "1.25rem",
    fontVariantNumeric: "tabular-nums",
    height: "2.5rem",
    justifyContent: "center",
    lineHeight: "1.75rem",
    outlineColor: { default: null, ":focus-visible": calendarVars["--ring"] },
    outlineOffset: { default: null, ":focus-visible": 1 },
    outlineStyle: { default: null, ":focus-visible": "solid" },
    outlineWidth: { default: null, ":focus-visible": 2 },
    padding: 0,
    width: "2.5rem",
  },
  day: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: "0.125rem",
    paddingBottom: "0.5rem",
  },
  dot: {
    backgroundColor: calendarVars["--calendar-event-border"],
    borderRadius: "9999px",
    flexShrink: 0,
    height: "0.5rem",
    width: "0.5rem",
  },
  events: {
    display: "flex",
    flexDirection: "column",
    gap: "0.125rem",
    marginInline: "-0.5rem",
    minHeight: 0,
    overflowY: "auto",
    paddingBlock: "0.25rem",
    paddingInline: "0.5rem",
  },
  noEvents: {
    color: calendarVars["--muted-foreground"],
    fontSize: "0.75rem",
    lineHeight: "1rem",
    marginBlock: 0,
    paddingBottom: "0.5rem",
    textAlign: "center",
  },
  popup: {
    gap: 0,
    padding: "0.5rem",
    width: "16rem",
  },
  time: {
    flexShrink: 0,
  },
  timeBar: {
    fontWeight: 400,
  },
  timeItem: {
    color: {
      default: calendarVars["--muted-foreground"],
      [stylex.when.ancestor(":hover", calendarMarker)]: calendarVars["--accent-foreground"],
    },
  },
  title: {
    flex: "1 1 0%",
    fontWeight: 500,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  weekday: {
    color: calendarVars["--muted-foreground"],
    fontSize: "0.6875rem",
    fontWeight: 500,
    textTransform: "uppercase",
  },
});

interface YearEventProps<TEvent> {
  readonly color?: CalendarEventColor;
  readonly formats: YearFormats;
  readonly fragment: EventDayFragment<TEvent, EventId, ResourceId>;
  /** Shown before the title, from the view's `getEventIcon`. */
  readonly icon?: ReactNode;
  readonly labelEvent: EventLabeler<TEvent>;
}

/**
 * One event in a day's list: all-day and multi-day events as filled bars, others as a coloured
 * dot, start time, and title. A `[data-event-id]` button, so the app's event details open from it
 * as from any view.
 */
function YearEvent<TEvent>({ color, formats, fragment, icon, labelEvent }: YearEventProps<TEvent>) {
  const { event } = fragment;
  const chip = useEventChip(event, { date: fragment.date, focusTarget: false, labelEvent });
  const bar = event.kind === "all-day" || fragment.startsBeforeDay || fragment.endsAfterDay;
  const time =
    event.kind === "all-day" || fragment.startsBeforeDay
      ? undefined
      : formats.time(fragment.start.toPlainTime());

  return (
    <EventChip
      color={color}
      {...chip}
      title={event.title}
      xstyle={[styles.chip, !bar && [styles.chipItem, calendarMarker]]}
    >
      {!bar && <span aria-hidden {...stylex.props(styles.dot)} />}
      {time !== undefined && (
        <span
          {...stylex.props(
            styles.time,
            // Muted on the hover fill falls short of 4.5:1.
            bar ? styles.timeBar : styles.timeItem,
          )}
        >
          {time}
        </span>
      )}
      <span data-slot="calendar-event-title" {...stylex.props(styles.title)}>
        <EventIcon>{icon}</EventIcon>
        {event.title}
      </span>
    </EventChip>
  );
}

export interface YearDayPopoverProps<TEvent> {
  /** The year's days by ISO date, so the popover shows a day's events as they are now. */
  readonly days: ReadonlyMap<string, YearDay<TEvent, EventId, ResourceId>>;
  readonly formats: YearFormats;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor;
  /** An icon before an event's title, or nothing. */
  readonly getEventIcon?: (event: TEvent) => ReactNode;
  readonly handle: YearDayPopoverHandle;
  readonly labelEvent: EventLabeler<TEvent>;
  readonly onOpenDay: (date: Temporal.PlainDate) => void;
  /** The view's element, where focus returns to the day the popover was open on. */
  readonly view: RefObject<HTMLElement | null>;
}

/**
 * One popover for every day of the year, through a handle every day shares, so the year never
 * mounts hundreds of roots. It lists the day's events and opens the day from its date. Closing it
 * returns focus to the day, unless a click outside focused something else.
 */
export function YearDayPopover<TEvent>({
  days,
  formats,
  getEventColor,
  getEventIcon,
  handle,
  labelEvent,
  onOpenDay,
  view,
}: YearDayPopoverProps<TEvent>) {
  const popup = useRef<HTMLDivElement>(null);

  return (
    <Popover handle={handle}>
      {({ payload: date }) => {
        if (date === undefined) return null;
        const fragments = days.get(date.toString())?.fragments ?? [];
        const name = formats.date.format(date);
        return (
          <PopoverContent
            ref={popup}
            aria-label={`Events on ${name}`}
            xstyle={styles.popup}
            // The popup takes focus, from a pointer or a key alike; Tab then reaches its events.
            initialFocus={popup}
            // The day's cell, the view's tab stop; ui-sdk leaves focus alone after a click outside.
            finalFocus={() =>
              view.current?.querySelector<HTMLElement>(
                `[role="gridcell"][data-date="${date.toString()}"]`,
              ) ?? null
            }
          >
            <div {...stylex.props(styles.day)}>
              <span {...stylex.props(styles.weekday)}>{formats.weekdayShort.format(date)}</span>
              <button
                type="button"
                aria-label={name}
                onClick={() => onOpenDay(date)}
                {...stylex.props(styles.date)}
              >
                {date.day}
              </button>
            </div>
            {fragments.length === 0 ? (
              <p {...stylex.props(styles.noEvents)}>No events</p>
            ) : (
              <div {...stylex.props(styles.events)}>
                {fragments.map((fragment) => (
                  <YearEvent
                    // `typeof` keeps numeric 1 and string "1" apart; they are distinct event IDs.
                    key={`${typeof fragment.event.id}:${fragment.event.id}`}
                    color={getEventColor?.(fragment.event.event)}
                    icon={getEventIcon?.(fragment.event.event)}
                    formats={formats}
                    fragment={fragment}
                    labelEvent={labelEvent}
                  />
                ))}
              </div>
            )}
          </PopoverContent>
        );
      }}
    </Popover>
  );
}
