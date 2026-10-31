"use client";

import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import {
  timeGridPosition,
  useNow,
  type CalendarEnvironmentBase,
  type TimeGridDay,
} from "@moltenship/calendar";
import * as stylex from "@stylexjs/stylex";
import { useLayoutEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";

import type { EventLabeler } from "@registry/stylex-calendar/event-label";
import type { UnavailableTimeRender } from "@registry/stylex-calendar/unavailable-time";
import { calendarVars } from "@registry/stylex-calendar-theme/calendar-tokens.stylex";
import type { CalendarEventColor } from "@registry/stylex-calendar-theme/event-colors";

import type { TimeGridAnnotationWiring } from "./time-grid-annotations";
import { TimeGridColumn, useTimeGridColumnFormats } from "./time-grid-column";
import { TimeGridZoneHours, zoneTimeFormat, type TimeGridZone } from "./time-grid-zones";

const styles = stylex.create({
  body: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    position: "relative",
    scrollbarGutter: "stable",
  },
  days: {
    backgroundImage: `linear-gradient(to bottom, ${calendarVars["--calendar-grid"]} 1px, transparent 1px)`,
    backgroundSize: `100% ${calendarVars["--calendar-hour-height"]}`,
    display: "grid",
    flex: 1,
  },
  hour: {
    color: calendarVars["--calendar-axis"],
    fontSize: "0.625rem",
    fontVariantNumeric: "tabular-nums",
    insetInlineEnd: "0.5rem",
    position: "absolute",
    transform: "translateY(-50%)",
    whiteSpace: "nowrap",
  },
  hours: {
    height: "100%",
    position: "relative",
  },
  ownHours: {
    flex: 1,
    minWidth: 0,
  },
  row: {
    display: "flex",
    height: `calc(${calendarVars["--calendar-hour-height"]} * 24)`,
  },
  rowHeader: {
    flexShrink: 0,
    width: "var(--calendar-gutter-width)",
  },
  withZones: {
    display: "flex",
    height: "100%",
  },
});

export interface TimeGridBodyProps<TEvent> {
  readonly annotations?: TimeGridAnnotationWiring;
  readonly days: readonly TimeGridDay<TEvent>[];
  readonly environment: CalendarEnvironmentBase;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
  readonly getEventIcon?: (event: TEvent) => ReactNode;
  /** The root takes no changes: events have no resize handles. */
  readonly isReadOnly?: boolean;
  readonly labelEvent: EventLabeler<TEvent>;
  /** Reports the 24-hour row's height in px when it changes, as zooming the hours does. */
  readonly onColumnHeightChange?: (height: number) => void;
  /** Opens a date in the day view; Shift+Enter on a slot does so. */
  readonly onOpenDay?: (date: Temporal.PlainDate) => void;
  readonly renderUnavailable?: UnavailableTimeRender;
  /** The scrolling element, which dragging also scrolls near its edges. */
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  /** Length of a keyboard slot, as the keyboard's snap sets it. */
  readonly slotMinutes: number;
  /** The root's secondary time zones, with an hour column each; see `useTimeGridZones`. */
  readonly zones?: readonly TimeGridZone[];
}

const noZones: readonly TimeGridZone[] = [];

/** Hour labels from 1:00 to 23:00; midnight sits under the header. */
const labelledHours = Array.from({ length: 23 }, (_, index) => index + 1);
/** Without a current time in view, open the day at 08:00. */
const DEFAULT_SCROLL_FRACTION = 8 / 24;

/**
 * The gutter's hour labels, from 1:00 to 23:00, over the full height of the element around it.
 * Each secondary zone's hours come first, in a `--calendar-zone-width` column of their own.
 */
export function TimeGridHours({
  locale,
  zones = noZones,
}: {
  readonly locale: Intl.LocalesArgument;
  readonly zones?: readonly TimeGridZone[];
}) {
  // "1 PM" where the locale uses a 12-hour clock, "13:00" where it uses 24 hours.
  const format = useMemo(() => zoneTimeFormat(locale), [locale]);
  const hours = (
    <div aria-hidden {...stylex.props(styles.hours)}>
      {labelledHours.map((hour) => (
        <span key={hour} {...stylex.props(styles.hour)} style={{ top: `${(hour / 24) * 100}%` }}>
          {format(new Temporal.PlainTime(hour))}
        </span>
      ))}
    </div>
  );
  if (zones.length === 0) return hours;

  return (
    <div {...stylex.props(styles.withZones)}>
      {zones.map((zone, index) => (
        <TimeGridZoneHours key={index} locale={locale} zone={zone} />
      ))}
      <div {...stylex.props(styles.ownHours)}>{hours}</div>
    </div>
  );
}

/**
 * Once the first clock sample arrives (after hydration, `now` starts as null), opens the scroll
 * element on the current time at `nowTop`, or on 08:00 when the current time is not visible.
 * Later ticks and navigation keep the user's scroll position.
 */
export function useOpeningScroll(
  scrollRef: RefObject<HTMLElement | null>,
  now: Temporal.Instant | null,
  nowTop: number | null,
): void {
  const scrolled = useRef(false);
  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (scrolled.current || node === null || now === null) return;
    scrolled.current = true;
    node.scrollTop =
      nowTop === null
        ? DEFAULT_SCROLL_FRACTION * node.scrollHeight
        : Math.max(0, nowTop * node.scrollHeight - node.clientHeight / 3);
  }, [now, nowTop, scrollRef]);
}

/** Reports an element's height whenever it changes, such as the 24-hour row when hours zoom. */
export function useHeightObserver(onHeightChange: ((height: number) => void) | undefined) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (node === null || onHeightChange === undefined || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined && entry.contentRect.height > 0) {
        onHeightChange(entry.contentRect.height);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [onHeightChange]);
  return ref;
}

/** The grid's timed row, scrolling through 24 hours: hour gutter, hour lines, and a cell per day. */
export function TimeGridBody<TEvent>({
  annotations,
  days,
  environment,
  getEventColor,
  getEventIcon,
  isReadOnly,
  labelEvent,
  onColumnHeightChange,
  onOpenDay,
  renderUnavailable,
  scrollRef,
  slotMinutes,
  zones,
}: TimeGridBodyProps<TEvent>) {
  const { locale, timeZone } = environment;
  const now = useNow();
  const nowPosition = useMemo(
    () =>
      now === null
        ? null
        : timeGridPosition(
            days.map(({ column }) => column),
            now,
          ),
    [days, now],
  );
  const formats = useTimeGridColumnFormats(locale);
  useOpeningScroll(scrollRef, now, nowPosition?.top ?? null);
  const rowRef = useHeightObserver(onColumnHeightChange);

  return (
    <div ref={scrollRef} data-slot="time-grid-body" {...stylex.props(styles.body)}>
      <div ref={rowRef} role="row" {...stylex.props(styles.row)}>
        <div role="rowheader" {...stylex.props(styles.rowHeader)}>
          <VisuallyHidden>Timed events</VisuallyHidden>
          <TimeGridHours locale={locale} zones={zones} />
        </div>
        <div
          {...stylex.props(styles.days)}
          style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
        >
          {days.map((day, index) => (
            <TimeGridColumn
              key={day.column.key}
              annotations={
                annotations === undefined
                  ? undefined
                  : { ...annotations, marks: annotations.layout.columns[index] ?? [] }
              }
              day={day}
              getEventColor={getEventColor}
              getEventIcon={getEventIcon}
              isReadOnly={isReadOnly}
              labelEvent={labelEvent}
              onOpenDay={onOpenDay}
              renderUnavailable={renderUnavailable}
              slotMinutes={slotMinutes}
              nowTop={nowPosition?.column === index ? nowPosition.top : null}
              formats={formats}
              timeZone={timeZone}
              zones={zones}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
