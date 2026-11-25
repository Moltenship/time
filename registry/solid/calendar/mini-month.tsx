import type { IsoDayOfWeek, PlainDateInterval } from "@moltenship/calendar-solid";
import { createMemo, createSignal, createUniqueId, For, onSettled } from "solid-js";

import { Button } from "@registry/calendar-ui/button";
import { ChevronLeftIcon, ChevronRightIcon } from "@registry/calendar-ui/icons";
import {
  isSameMonth,
  miniMonthDay,
  miniMonthFormats,
  miniMonthKeySteps,
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
import { cn } from "cn";

export interface MiniMonthProps {
  readonly class?: string;
  readonly locale: Intl.LocalesArgument;
  readonly onSelectDate: (date: Temporal.PlainDate) => void;
  readonly selectedDate: Temporal.PlainDate;
  readonly today: Temporal.PlainDate;
  /** Dates the main view currently shows, highlighted as a band. */
  readonly visibleRange?: PlainDateInterval;
  readonly weekStartsOn: IsoDayOfWeek;
}

const sameDate = (left: Temporal.PlainDate, right: Temporal.PlainDate) => left.equals(right);

/** A navigable month for sidebars: highlights today, the selected date, and the visible range. */
export function MiniMonth(props: MiniMonthProps) {
  const titleId = createUniqueId();
  let grid: HTMLTableElement | undefined;
  // Follow the main calendar: a new selected date brings its month into view.
  const selected = createMemo(() => props.selectedDate, { equals: sameDate });
  const [month, setMonth] = createSignal(() => startOfMonth(selected()), { equals: sameDate });
  const [focused, setFocused] = createSignal(() => selected(), { equals: sameDate });
  const formats = createMemo(() => miniMonthFormats(props.locale));
  const weeks = createMemo(() => miniMonthWeeks(month(), props.weekStartsOn));
  const tabStop = () => miniMonthTabStop(focused(), month());

  // Native, so it runs before a calendar's keyboard when the mini month sits inside its frame.
  const moveFocus = (element: HTMLTableElement) => {
    grid = element;
    element.addEventListener("keydown", (event) => {
      const step = miniMonthKeySteps[event.key];
      if (step === undefined) return;
      event.preventDefault();
      const next = tabStop().add(step);
      setFocused(next);
      if (!isSameMonth(next, month())) setMonth(startOfMonth(next));
      onSettled(() => grid?.querySelector<HTMLButtonElement>('button[tabindex="0"]')?.focus());
    });
  };

  return (
    <div class={cn(miniMonthClass, props.class)}>
      <div class={miniMonthHeaderClass}>
        <h2 id={titleId} aria-live="polite" class={miniMonthTitleClass}>
          {formats().month.format(month())}
        </h2>
        <div class={miniMonthStepsClass}>
          <Button
            aria-label={miniMonthLabels.previous}
            class={miniMonthStepClass}
            onClick={() => setMonth(month().subtract({ months: 1 }))}
            size="icon-sm"
            variant="ghost"
          >
            <ChevronLeftIcon aria-hidden="true" class={miniMonthStepIconClass} />
          </Button>
          <Button
            aria-label={miniMonthLabels.next}
            class={miniMonthStepClass}
            onClick={() => setMonth(month().add({ months: 1 }))}
            size="icon-sm"
            variant="ghost"
          >
            <ChevronRightIcon aria-hidden="true" class={miniMonthStepIconClass} />
          </Button>
        </div>
      </div>
      <table ref={moveFocus} role="grid" aria-labelledby={titleId} class={miniMonthGridClass}>
        <thead>
          <tr>
            <For each={weeks()[0] ?? []} keyed={(date) => date.dayOfWeek}>
              {(date) => (
                <th
                  abbr={formats().weekdayName.format(date())}
                  scope="col"
                  class={miniMonthWeekdayClass}
                >
                  {formats().weekday.format(date())}
                </th>
              )}
            </For>
          </tr>
        </thead>
        <tbody>
          <For each={weeks()} keyed={(dates) => dates[0]?.toString()}>
            {(dates) => (
              <tr>
                <For each={dates()} keyed={(date) => date.toString()}>
                  {(date, column) => {
                    const day = () =>
                      miniMonthDay(date(), column(), {
                        month: month(),
                        selectedDate: props.selectedDate,
                        today: props.today,
                        visibleRange: props.visibleRange,
                      });
                    return (
                      <td
                        aria-selected={day().isSelected ? "true" : "false"}
                        data-visible={day().isVisible ? "" : undefined}
                        class={miniMonthCellClass(day())}
                      >
                        <button
                          type="button"
                          aria-current={day().isToday ? "date" : undefined}
                          aria-label={formats().day.format(date())}
                          data-outside-month={day().inMonth ? undefined : ""}
                          tabindex={date().equals(tabStop()) ? 0 : -1}
                          class={miniMonthDayClass(day())}
                          onClick={() => {
                            setFocused(date());
                            props.onSelectDate(date());
                          }}
                        >
                          {date().day}
                        </button>
                      </td>
                    );
                  }}
                </For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}
