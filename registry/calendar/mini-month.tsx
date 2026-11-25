"use client";

import type { IsoDayOfWeek, PlainDateInterval } from "@moltenship/calendar";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { cn } from "cn";
import { Button } from "@registry/calendar-ui/button";
import {
  isSameMonth,
  miniMonthDay,
  miniMonthFormats,
  miniMonthKeyStep,
  miniMonthTabStop,
  miniMonthWeeks,
  startOfMonth,
} from "@registry/shared/calendar/mini-month-dates";
import {
  miniMonthCellClass,
  miniMonthClass,
  miniMonthDayClass,
  miniMonthGridClass,
  miniMonthHeaderClass,
  miniMonthStepClass,
  miniMonthStepIconClass,
  miniMonthStepsClass,
  miniMonthTitleClass,
  miniMonthWeekdayClass,
} from "@registry/shared/calendar/mini-month.styles";
import { miniMonthLabels } from "@registry/shared/calendar/navigation-labels";

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
  const formats = useMemo(() => miniMonthFormats(locale), [locale]);

  // Follow the main calendar: a new selected date brings its month into view.
  if (!syncedDate.equals(selectedDate)) {
    setSyncedDate(selectedDate);
    setFocusedDate(selectedDate);
    setMonth(startOfMonth(selectedDate));
  }

  const weeks = useMemo(() => miniMonthWeeks(month, weekStartsOn), [month, weekStartsOn]);
  const tabStop = miniMonthTabStop(focusedDate, month);

  useEffect(() => {
    if (!focusTabStop.current) return;
    focusTabStop.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>('button[tabindex="0"]')?.focus();
  });

  function moveFocus(event: KeyboardEvent<HTMLTableElement>) {
    const step = miniMonthKeyStep(event.key, getComputedStyle(event.currentTarget).direction);
    if (step === undefined) return;
    event.preventDefault();
    const next = tabStop.add(step);
    focusTabStop.current = true;
    setFocusedDate(next);
    if (!isSameMonth(next, month)) setMonth(startOfMonth(next));
  }

  return (
    <div className={cn(miniMonthClass, className)}>
      <div className={miniMonthHeaderClass}>
        <h2 id={titleId} aria-live="polite" className={miniMonthTitleClass}>
          {formats.month.format(month)}
        </h2>
        <div className={miniMonthStepsClass}>
          <Button
            aria-label={miniMonthLabels.previous}
            className={miniMonthStepClass}
            onClick={() => setMonth(month.subtract({ months: 1 }))}
            size="icon-sm"
            variant="ghost"
          >
            <ChevronLeftIcon className={miniMonthStepIconClass} />
          </Button>
          <Button
            aria-label={miniMonthLabels.next}
            className={miniMonthStepClass}
            onClick={() => setMonth(month.add({ months: 1 }))}
            size="icon-sm"
            variant="ghost"
          >
            <ChevronRightIcon className={miniMonthStepIconClass} />
          </Button>
        </div>
      </div>
      <table
        ref={gridRef}
        role="grid"
        aria-labelledby={titleId}
        className={miniMonthGridClass}
        onKeyDown={moveFocus}
      >
        <thead>
          <tr>
            {weeks[0]?.map((date) => (
              <th
                key={date.dayOfWeek}
                abbr={formats.weekdayName.format(date)}
                scope="col"
                className={miniMonthWeekdayClass}
              >
                {formats.weekday.format(date)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((dates) => (
            <tr key={dates[0]?.toString()}>
              {dates.map((date, column) => {
                const day = miniMonthDay(date, column, {
                  month,
                  selectedDate,
                  today,
                  visibleRange,
                });
                return (
                  <td
                    key={date.toString()}
                    aria-selected={day.isSelected}
                    data-visible={day.isVisible ? "" : undefined}
                    className={miniMonthCellClass(day)}
                  >
                    <button
                      type="button"
                      aria-current={day.isToday ? "date" : undefined}
                      aria-label={formats.day.format(date)}
                      data-outside-month={day.inMonth ? undefined : ""}
                      tabIndex={date.equals(tabStop) ? 0 : -1}
                      className={miniMonthDayClass(day)}
                      onClick={() => {
                        setFocusedDate(date);
                        onSelectDate(date);
                      }}
                    >
                      {date.day}
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
