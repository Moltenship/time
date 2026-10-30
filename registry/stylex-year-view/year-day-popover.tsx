"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
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

import type { YearDayPopoverHandle, YearFormats } from "./year-month";

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
    transitionProperty: "box-shadow",
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
    animationDuration: "100ms",
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
 * One popover for every day of the year, through Base UI's detached triggers, so the year never
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
    <PopoverPrimitive.Root handle={handle}>
      {({ payload: date }) => {
        if (date === undefined) return null;
        const fragments = days.get(date.toString())?.fragments ?? [];
        const name = formats.date.format(date);
        return (
          <PopoverPrimitive.Portal>
            <PopoverPrimitive.Positioner sideOffset={4} {...stylex.props(styles.positioner)}>
              <PopoverPrimitive.Popup
                ref={popup}
                data-slot="popover-content"
                aria-label={`Events on ${name}`}
                {...stylex.props(styles.popup)}
                // The popup takes focus, from a pointer or a key alike; Tab then reaches its events.
                initialFocus={popup}
                finalFocus={() => {
                  // An outside click that focused something else keeps that focus.
                  const active = document.activeElement;
                  if (
                    active !== null &&
                    active !== document.body &&
                    !popup.current?.contains(active)
                  ) {
                    return false;
                  }
                  return (
                    view.current?.querySelector<HTMLElement>(
                      `[role="gridcell"][data-date="${date.toString()}"]`,
                    ) ?? false
                  );
                }}
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
              </PopoverPrimitive.Popup>
            </PopoverPrimitive.Positioner>
          </PopoverPrimitive.Portal>
        );
      }}
    </PopoverPrimitive.Root>
  );
}
