import {
  monthGrid,
  plainDateIntervalContains,
  type IsoDayOfWeek,
  type PlainDateInterval,
} from "@moltenship/calendar";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { cn } from "@registry/lib/utils";
import { Button } from "@registry/ui/button";

export interface MiniMonthProps {
  readonly className?: string;
  readonly locale: Intl.LocalesArgument;
  readonly onSelectDate: (date: Temporal.PlainDate) => void;
  readonly selectedDate: Temporal.PlainDate;
  readonly today: Temporal.PlainDate;
  /** Dates the main view currently shows, highlighted as a band. */
  readonly visibleRange?: PlainDateInterval;
  readonly weekStartsOn: IsoDayOfWeek;
}

const keyboardSteps: Partial<Record<string, Temporal.DurationLike>> = {
  ArrowDown: { days: 7 },
  ArrowLeft: { days: -1 },
  ArrowRight: { days: 1 },
  ArrowUp: { days: -7 },
  PageDown: { months: 1 },
  PageUp: { months: -1 },
};

function startOfMonth(date: Temporal.PlainDate): Temporal.PlainDate {
  return date.with({ day: 1 });
}

function isSameMonth(date: Temporal.PlainDate, month: Temporal.PlainDate): boolean {
  return date.year === month.year && date.month === month.month;
}

function useMiniMonthFormats(locale: Intl.LocalesArgument) {
  return useMemo(
    () => ({
      day: new Intl.DateTimeFormat(locale, { dateStyle: "full" }),
      month: new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }),
      weekday: new Intl.DateTimeFormat(locale, { weekday: "narrow" }),
      weekdayName: new Intl.DateTimeFormat(locale, { weekday: "long" }),
    }),
    [locale],
  );
}

/** A navigable month for sidebars: highlights today, the selected date, and the visible range. */
export function MiniMonth({
  className,
  locale,
  onSelectDate,
  selectedDate,
  today,
  visibleRange,
  weekStartsOn,
}: MiniMonthProps) {
  const titleId = useId();
  const gridRef = useRef<HTMLTableElement>(null);
  const focusTabStop = useRef(false);
  const [month, setMonth] = useState(() => startOfMonth(selectedDate));
  const [focusedDate, setFocusedDate] = useState(selectedDate);
  const [syncedDate, setSyncedDate] = useState(selectedDate);
  const formats = useMiniMonthFormats(locale);

  // Follow the main calendar: a new selected date brings its month into view.
  if (!syncedDate.equals(selectedDate)) {
    setSyncedDate(selectedDate);
    setFocusedDate(selectedDate);
    setMonth(startOfMonth(selectedDate));
  }

  const weeks = useMemo(
    () =>
      monthGrid(month, { fixedWeeks: true, weekStartsOn }).weeks.map((week) =>
        Array.from({ length: 7 }, (_, index) => week.start.add({ days: index })),
      ),
    [month, weekStartsOn],
  );
  const tabStop = isSameMonth(focusedDate, month) ? focusedDate : month;
  const lastVisibleDate = visibleRange?.end.subtract({ days: 1 });

  useEffect(() => {
    if (!focusTabStop.current) return;
    focusTabStop.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>('button[tabindex="0"]')?.focus();
  });

  function moveFocus(event: KeyboardEvent<HTMLTableElement>) {
    const step = keyboardSteps[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = tabStop.add(step);
    focusTabStop.current = true;
    setFocusedDate(next);
    if (!isSameMonth(next, month)) setMonth(startOfMonth(next));
  }

  return (
    <div className={cn("w-full select-none", className)}>
      <div className="flex items-center justify-between pb-1 pl-2">
        <h2 id={titleId} aria-live="polite" className="text-sm font-medium">
          {formats.month.format(month)}
        </h2>
        <div className="flex">
          <Button
            aria-label="Previous month"
            className="rounded-full"
            onClick={() => setMonth(month.subtract({ months: 1 }))}
            size="icon-sm"
            variant="ghost"
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            aria-label="Next month"
            className="rounded-full"
            onClick={() => setMonth(month.add({ months: 1 }))}
            size="icon-sm"
            variant="ghost"
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </div>
      <table
        ref={gridRef}
        role="grid"
        aria-labelledby={titleId}
        className="w-full border-collapse"
        onKeyDown={moveFocus}
      >
        <thead>
          <tr>
            {weeks[0]?.map((day) => (
              <th
                key={day.dayOfWeek}
                abbr={formats.weekdayName.format(day)}
                scope="col"
                className="pb-1 text-[0.6875rem] font-medium text-muted-foreground"
              >
                {formats.weekday.format(day)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((days) => (
            <tr key={days[0]?.toString()}>
              {days.map((day, column) => {
                const isToday = day.equals(today);
                const isSelected = day.equals(selectedDate);
                const isVisible =
                  visibleRange !== undefined && plainDateIntervalContains(visibleRange, day);

                return (
                  <td
                    key={day.toString()}
                    aria-selected={isSelected}
                    data-visible={isVisible ? "" : undefined}
                    className={cn(
                      "p-0 py-px",
                      isVisible && "bg-calendar-selection",
                      isVisible &&
                        (column === 0 || day.equals(visibleRange.start)) &&
                        "rounded-l-full",
                      isVisible &&
                        (column === 6 || (lastVisibleDate && day.equals(lastVisibleDate))) &&
                        "rounded-r-full",
                    )}
                  >
                    <button
                      type="button"
                      aria-current={isToday ? "date" : undefined}
                      aria-label={formats.day.format(day)}
                      data-outside-month={isSameMonth(day, month) ? undefined : ""}
                      tabIndex={day.equals(tabStop) ? 0 : -1}
                      className={cn(
                        "mx-auto flex size-7 items-center justify-center rounded-full text-xs tabular-nums outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
                        !isSameMonth(day, month) && "text-muted-foreground",
                        isSelected && "font-semibold text-calendar-today",
                        isToday &&
                          "bg-calendar-today font-semibold text-calendar-today-foreground hover:bg-calendar-today/90",
                      )}
                      onClick={() => {
                        setFocusedDate(day);
                        onSelectDate(day);
                      }}
                    >
                      {day.day}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
