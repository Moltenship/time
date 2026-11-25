"use client";

import {
  timeGridPosition,
  useNow,
  type CalendarEnvironmentBase,
  type TimeGridDay,
} from "@moltenship/calendar";
import { useLayoutEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";

import type { EventLabeler } from "@registry/calendar/event-label";
import type { UnavailableTimeRender } from "@registry/calendar/unavailable-time";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import {
  dayColumns,
  hourTop,
  labelledHours,
  openingScrollTop,
} from "@registry/shared/time-grid-view/time-grid-geometry";
import { timedEventsLabel } from "@registry/shared/time-grid-view/time-grid-labels";
import {
  srOnlyClass,
  timeGridBodyClass,
  timeGridColumnsClass,
  timeGridDisplayHoursClass,
  timeGridHourLabelClass,
  timeGridHoursClass,
  timeGridRowHeaderClass,
  timeGridTimedRowClass,
  timeGridZonedHoursClass,
} from "@registry/shared/time-grid-view/time-grid.styles";

import type { TimeGridAnnotationWiring } from "./time-grid-annotations";
import { TimeGridColumn, useTimeGridColumnFormats } from "./time-grid-column";
import { TimeGridZoneHours, zoneTimeFormat, type TimeGridZone } from "./time-grid-zones";

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
    <div aria-hidden className={timeGridHoursClass}>
      {labelledHours.map((hour) => (
        <span key={hour} className={timeGridHourLabelClass} style={{ top: hourTop(hour) }}>
          {format(new Temporal.PlainTime(hour))}
        </span>
      ))}
    </div>
  );
  if (zones.length === 0) return hours;

  return (
    <div className={timeGridZonedHoursClass}>
      {zones.map((zone, index) => (
        <TimeGridZoneHours key={index} locale={locale} zone={zone} />
      ))}
      <div className={timeGridDisplayHoursClass}>{hours}</div>
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
    node.scrollTop = openingScrollTop(nowTop, node.scrollHeight, node.clientHeight);
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
    <div ref={scrollRef} data-slot="time-grid-body" className={timeGridBodyClass}>
      <div ref={rowRef} role="row" className={timeGridTimedRowClass}>
        <div role="rowheader" className={timeGridRowHeaderClass}>
          <span className={srOnlyClass}>{timedEventsLabel}</span>
          <TimeGridHours locale={locale} zones={zones} />
        </div>
        <div
          className={timeGridColumnsClass}
          style={{ gridTemplateColumns: dayColumns(days.length) }}
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
