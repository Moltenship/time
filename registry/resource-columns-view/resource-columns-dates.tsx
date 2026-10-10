import type { TimeGridDay } from "@moltenship/calendar";
import type { VirtualItem } from "@tanstack/react-virtual";
import { useMemo, type RefCallback } from "react";

import { cn } from "cn";

export interface ResourceColumnsDatesProps {
  readonly days: readonly TimeGridDay<unknown>[];
  /** Follows the body's sideways scroll; see `useAxisSync`. */
  readonly followX: RefCallback<HTMLElement>;
  /** The rendered columns, from the column virtualizer. */
  readonly items: readonly VirtualItem[];
  readonly locale: Intl.LocalesArgument;
  readonly scrollbarWidth: number;
  readonly totalSize: number;
}

/** Over several days, the weekday and date of each of a resource's day columns. */
export function ResourceColumnsDates({
  days,
  followX,
  items,
  locale,
  scrollbarWidth,
  totalSize,
}: ResourceColumnsDatesProps) {
  const formats = useMemo(
    () => ({
      full: new Intl.DateTimeFormat(locale, { dateStyle: "full" }),
      weekday: new Intl.DateTimeFormat(locale, { weekday: "short" }),
    }),
    [locale],
  );

  return (
    <div role="row" className="flex h-7">
      <div role="columnheader" aria-colindex={1} className="w-(--calendar-gutter-width) shrink-0">
        <span className="sr-only">Date</span>
      </div>
      <div
        className="relative min-w-0 flex-1 overflow-clip"
        style={{ marginInlineEnd: scrollbarWidth }}
      >
        <div ref={followX} className="relative h-full" style={{ width: totalSize }}>
          {items.map(({ index, key, size, start }) => (
            <div
              key={key}
              className="absolute inset-y-0 grid"
              style={{
                gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
                insetInlineStart: start,
                width: size,
              }}
            >
              {days.map(({ column: { date, key: dayKey }, isToday }, day) => (
                <div
                  key={dayKey}
                  role="columnheader"
                  aria-colindex={2 + index * days.length + day}
                  aria-current={isToday ? "date" : undefined}
                  aria-label={formats.full.format(date)}
                  className="flex min-w-0 items-center justify-center gap-1 border-s border-calendar-grid text-xs"
                >
                  <span
                    className={cn(
                      "font-medium uppercase",
                      isToday ? "text-calendar-today" : "text-muted-foreground",
                    )}
                  >
                    {formats.weekday.format(date)}
                  </span>
                  <span
                    className={cn("tabular-nums", isToday && "font-semibold text-calendar-today")}
                  >
                    {date.day}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
