import {
  timeGridPosition,
  useNow,
  type CalendarEnvironmentBase,
  type TimeGridDay,
} from "@moltenship/calendar";
import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";

import type { EventLabeler } from "@registry/calendar/event-label";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";

import type { TimeGridAnnotationWiring } from "./time-grid-annotations";
import { TimeGridColumn, useTimeGridColumnFormats } from "./time-grid-column";

export interface TimeGridBodyProps<TEvent> {
  readonly annotations?: TimeGridAnnotationWiring;
  readonly days: readonly TimeGridDay<TEvent>[];
  readonly environment: CalendarEnvironmentBase;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
  readonly labelEvent: EventLabeler<TEvent>;
  /** Reports the 24-hour row's height in px when it changes, as zooming the hours does. */
  readonly onColumnHeightChange?: (height: number) => void;
  /** Opens a date in the day view; Shift+Enter on a slot does so. */
  readonly onOpenDay?: (date: Temporal.PlainDate) => void;
  /** The scrolling element, which dragging also scrolls near its edges. */
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  /** Length of a keyboard slot, as the keyboard's snap sets it. */
  readonly slotMinutes: number;
}

/** Hour labels from 1:00 to 23:00; midnight sits under the header. */
const labelledHours = Array.from({ length: 23 }, (_, index) => index + 1);
/** Without a current time in view, open the day at 08:00. */
const DEFAULT_SCROLL_FRACTION = 8 / 24;

/** "1 PM" where the locale uses a 12-hour clock, "13:00" where it uses 24 hours. */
function hourFormat(locale: Intl.LocalesArgument): Intl.DateTimeFormat {
  const hours = new Intl.DateTimeFormat(locale, { hour: "numeric" });
  const { hourCycle } = hours.resolvedOptions();
  return hourCycle === "h11" || hourCycle === "h12"
    ? hours
    : new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" });
}

/** The gutter's hour labels, from 1:00 to 23:00, over the full height of the element around it. */
export function TimeGridHours({ locale }: { readonly locale: Intl.LocalesArgument }) {
  const format = useMemo(() => hourFormat(locale), [locale]);

  return (
    <div aria-hidden className="relative h-full">
      {labelledHours.map((hour) => (
        <span
          key={hour}
          className="absolute end-2 -translate-y-1/2 text-[0.625rem] whitespace-nowrap text-calendar-axis tabular-nums"
          style={{ top: `${(hour / 24) * 100}%` }}
        >
          {format.format(new Temporal.PlainTime(hour))}
        </span>
      ))}
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
  labelEvent,
  onColumnHeightChange,
  onOpenDay,
  scrollRef,
  slotMinutes,
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
          <TimeGridHours locale={locale} />
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
              labelEvent={labelEvent}
              onOpenDay={onOpenDay}
              slotMinutes={slotMinutes}
              nowTop={nowPosition?.column === index ? nowPosition.top : null}
              formats={formats}
              timeZone={timeZone}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
