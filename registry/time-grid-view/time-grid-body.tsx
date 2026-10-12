import {
  timeGridPosition,
  useNow,
  type CalendarEnvironmentBase,
  type TimeGridDay,
} from "@moltenship/calendar";
import { useLayoutEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";

import type { EventLabeler } from "@registry/calendar/event-label";
import type { UnavailableTimeRender } from "@registry/calendar/unavailable-time";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";

import type { TimeGridAnnotationWiring } from "./time-grid-annotations";
import { TimeGridColumn, useTimeGridColumnFormats } from "./time-grid-column";
import { TimeGridZoneHours, zoneTimeFormat, type TimeGridZone } from "./time-grid-zones";

export interface TimeGridBodyProps<TEvent> {
  readonly annotations?: TimeGridAnnotationWiring;
  readonly days: readonly TimeGridDay<TEvent>[];
  readonly environment: CalendarEnvironmentBase;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
  readonly getEventIcon?: (event: TEvent) => ReactNode;
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
    <div aria-hidden className="relative h-full">
      {labelledHours.map((hour) => (
        <span
          key={hour}
          className="absolute end-2 -translate-y-1/2 text-[0.625rem] whitespace-nowrap text-calendar-axis tabular-nums"
          style={{ top: `${(hour / 24) * 100}%` }}
        >
          {format(new Temporal.PlainTime(hour))}
        </span>
      ))}
    </div>
  );
  if (zones.length === 0) return hours;

  return (
    <div className="flex h-full">
      {zones.map((zone, index) => (
        <TimeGridZoneHours key={index} locale={locale} zone={zone} />
      ))}
      <div className="min-w-0 flex-1">{hours}</div>
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
    <div
      ref={scrollRef}
      data-slot="time-grid-body"
      className="relative min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]"
    >
      <div ref={rowRef} role="row" className="flex h-[calc(var(--calendar-hour-height)*24)]">
        <div role="rowheader" className="w-(--calendar-gutter-width) shrink-0">
          <span className="sr-only">Timed events</span>
          <TimeGridHours locale={locale} zones={zones} />
        </div>
        <div
          className="grid flex-1 bg-[linear-gradient(to_bottom,var(--calendar-grid)_1px,transparent_1px)] bg-size-[100%_var(--calendar-hour-height)]"
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
