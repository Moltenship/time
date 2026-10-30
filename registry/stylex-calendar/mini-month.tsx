"use client";

import { IconButton } from "@astryxdesign/core/IconButton";
import {
  monthGrid,
  plainDateIntervalContains,
  type IsoDayOfWeek,
  type PlainDateInterval,
} from "@moltenship/calendar";
import * as stylex from "@stylexjs/stylex";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { calendarVars } from "@registry/stylex-calendar-theme/calendar-tokens.stylex";
import { type XStyle, xprops } from "@registry/stylex-calendar-theme/xprops";

const styles = stylex.create({
  cell: {
    paddingBlock: "1px",
    paddingInline: 0,
  },
  cellEnd: {
    borderEndEndRadius: "9999px",
    borderStartEndRadius: "9999px",
  },
  cellStart: {
    borderEndStartRadius: "9999px",
    borderStartStartRadius: "9999px",
  },
  cellVisible: {
    backgroundColor: calendarVars["--calendar-selection"],
  },
  day: {
    alignItems: "center",
    appearance: "none",
    backgroundColor: { default: "transparent", ":hover": calendarVars["--accent"] },
    borderRadius: "9999px",
    borderWidth: 0,
    boxShadow: { default: null, ":focus-visible": `0 0 0 2px ${calendarVars["--ring"]}` },
    color: "inherit",
    cursor: "pointer",
    display: "flex",
    fontFamily: "inherit",
    fontSize: "0.75rem",
    fontVariantNumeric: "tabular-nums",
    height: "1.75rem",
    justifyContent: "center",
    lineHeight: "1rem",
    marginInline: "auto",
    outlineStyle: "none",
    padding: 0,
    width: "1.75rem",
  },
  dayOutside: {
    color: {
      default: calendarVars["--muted-foreground"],
      ":hover": calendarVars["--accent-foreground"],
    },
  },
  daySelected: {
    color: calendarVars["--calendar-today"],
    fontWeight: 600,
  },
  daySelectedOutside: {
    color: {
      default: calendarVars["--calendar-today"],
      ":hover": calendarVars["--accent-foreground"],
    },
    fontWeight: 600,
  },
  dayToday: {
    backgroundColor: {
      default: calendarVars["--calendar-today"],
      ":hover": `color-mix(in oklch, ${calendarVars["--calendar-today"]} 90%, transparent)`,
    },
    color: calendarVars["--calendar-today-foreground"],
    fontWeight: 600,
  },
  grid: {
    borderCollapse: "collapse",
    width: "100%",
  },
  header: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
    paddingBottom: "0.25rem",
    paddingInlineStart: "0.5rem",
  },
  icon: {
    flexShrink: 0,
    height: "1rem",
    pointerEvents: "none",
    rotate: { default: null, ":dir(rtl)": "180deg" },
    width: "1rem",
  },
  miniMonth: {
    userSelect: "none",
    width: "100%",
  },
  round: {
    borderRadius: "9999px",
  },
  steps: {
    display: "flex",
  },
  title: {
    fontSize: "0.875rem",
    fontWeight: 500,
    lineHeight: "1.25rem",
    marginBlock: 0,
  },
  weekday: {
    color: calendarVars["--muted-foreground"],
    fontSize: "0.6875rem",
    fontWeight: 500,
    paddingBlockStart: 0,
    paddingBottom: "0.25rem",
    paddingInline: 0,
    textAlign: "center",
  },
});

export interface MiniMonthProps {
  readonly className?: string;
  readonly locale: Intl.LocalesArgument;
  readonly onSelectDate: (date: Temporal.PlainDate) => void;
  readonly selectedDate: Temporal.PlainDate;
  readonly today: Temporal.PlainDate;
  /** Dates the main view currently shows, highlighted as a band. */
  readonly visibleRange?: PlainDateInterval;
  readonly weekStartsOn: IsoDayOfWeek;
  /** Styles the app adds, after the mini month's own. */
  readonly xstyle?: XStyle;
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
  xstyle,
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
    <div {...xprops({ className }, styles.miniMonth, xstyle)}>
      <div {...stylex.props(styles.header)}>
        <h2 id={titleId} aria-live="polite" {...stylex.props(styles.title)}>
          {formats.month.format(month)}
        </h2>
        <div {...stylex.props(styles.steps)}>
          <IconButton
            icon={<ChevronLeftIcon {...stylex.props(styles.icon)} />}
            label="Previous month"
            onClick={() => setMonth(month.subtract({ months: 1 }))}
            size="sm"
            variant="ghost"
            xstyle={styles.round}
          />
          <IconButton
            icon={<ChevronRightIcon {...stylex.props(styles.icon)} />}
            label="Next month"
            onClick={() => setMonth(month.add({ months: 1 }))}
            size="sm"
            variant="ghost"
            xstyle={styles.round}
          />
        </div>
      </div>
      <table
        ref={gridRef}
        role="grid"
        aria-labelledby={titleId}
        onKeyDown={moveFocus}
        {...stylex.props(styles.grid)}
      >
        <thead>
          <tr>
            {weeks[0]?.map((day) => (
              // A header cell inherits an ancestor's explicit text-align, so it centers itself.
              <th
                key={day.dayOfWeek}
                abbr={formats.weekdayName.format(day)}
                scope="col"
                {...stylex.props(styles.weekday)}
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
                const isOutside = !isSameMonth(day, month) && !isVisible && !isToday;

                return (
                  <td
                    key={day.toString()}
                    aria-selected={isSelected}
                    data-visible={isVisible ? "" : undefined}
                    {...stylex.props(
                      styles.cell,
                      isVisible && styles.cellVisible,
                      isVisible &&
                        (column === 0 || day.equals(visibleRange.start)) &&
                        styles.cellStart,
                      isVisible &&
                        (column === 6 || (lastVisibleDate && day.equals(lastVisibleDate))) &&
                        styles.cellEnd,
                    )}
                  >
                    <button
                      type="button"
                      aria-current={isToday ? "date" : undefined}
                      aria-label={formats.day.format(day)}
                      data-outside-month={isSameMonth(day, month) ? undefined : ""}
                      tabIndex={day.equals(tabStop) ? 0 : -1}
                      onClick={() => {
                        setFocusedDate(day);
                        onSelectDate(day);
                      }}
                      {...stylex.props(
                        styles.day,
                        // Muted text is under 4.5:1 on the range band and the hover fill.
                        isOutside && styles.dayOutside,
                        isSelected && (isOutside ? styles.daySelectedOutside : styles.daySelected),
                        isToday && styles.dayToday,
                      )}
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
