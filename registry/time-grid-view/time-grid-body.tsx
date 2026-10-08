import {
  timeGridPosition,
  useNow,
  type CalendarEnvironmentBase,
  type TimeGridDay,
} from "@moltenship/calendar";
import { useLayoutEffect, useMemo, useRef } from "react";

import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";

import { TimeGridColumn } from "./time-grid-column";

export interface TimeGridBodyProps<TEvent> {
  readonly days: readonly TimeGridDay<TEvent>[];
  readonly environment: CalendarEnvironmentBase;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
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

/** The scrolling 24-hour area: hour gutter, hour lines, and one column per day. */
export function TimeGridBody<TEvent>({
  days,
  environment,
  getEventColor,
}: TimeGridBodyProps<TEvent>) {
  const { locale, timeZone } = environment;
  const scrollRef = useRef<HTMLDivElement>(null);
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
  const formats = useMemo(
    () => ({
      hour: hourFormat(locale),
      time: new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }),
    }),
    [locale],
  );

  // Once the first clock sample arrives (after hydration, `now` starts as null), open on the
  // current time, or 08:00 when today is not visible. Later ticks and navigation keep the user's
  // scroll position.
  const scrolled = useRef(false);
  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (scrolled.current || node === null || now === null) return;
    scrolled.current = true;
    node.scrollTop =
      nowPosition === null
        ? DEFAULT_SCROLL_FRACTION * node.scrollHeight
        : Math.max(0, nowPosition.top * node.scrollHeight - node.clientHeight / 3);
  }, [now, nowPosition]);

  return (
    <div
      ref={scrollRef}
      data-slot="time-grid-body"
      className="relative min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]"
    >
      <div className="flex h-[calc(var(--calendar-hour-height)*24)]">
        <div aria-hidden className="relative w-(--calendar-gutter-width) shrink-0">
          {labelledHours.map((hour) => (
            <span
              key={hour}
              className="absolute right-2 -translate-y-1/2 text-[0.625rem] whitespace-nowrap text-calendar-axis tabular-nums"
              style={{ top: `${(hour / 24) * 100}%` }}
            >
              {formats.hour.format(new Temporal.PlainTime(hour))}
            </span>
          ))}
        </div>
        <div
          className="grid flex-1 bg-[linear-gradient(to_bottom,var(--calendar-grid)_1px,transparent_1px)] bg-size-[100%_var(--calendar-hour-height)]"
          style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
        >
          {days.map((day, index) => (
            <TimeGridColumn
              key={day.column.key}
              day={day}
              getEventColor={getEventColor}
              nowTop={nowPosition?.column === index ? nowPosition.top : null}
              timeFormat={formats.time}
              timeZone={timeZone}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
