"use client";

import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import type { TimeGridDay } from "@moltenship/calendar";
import * as stylex from "@stylexjs/stylex";
import type { VirtualItem } from "@tanstack/react-virtual";
import { useMemo, type RefCallback } from "react";

import {
  TimeGridZoneNotes,
  zoneNotesByDate,
  type TimeGridZone,
} from "@registry/stylex-time-grid-view/time-grid-zones";
import { calendarVars } from "@registry/stylex-calendar-theme/calendar-tokens.stylex";

const styles = stylex.create({
  clip: {
    flex: "1",
    minWidth: 0,
    overflow: "clip",
    position: "relative",
  },
  date: {
    fontVariantNumeric: "tabular-nums",
  },
  dateToday: {
    color: calendarVars["--calendar-today"],
    fontWeight: 600,
  },
  day: {
    alignItems: "center",
    borderInlineStartColor: calendarVars["--calendar-grid"],
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: 1,
    display: "flex",
    fontSize: "0.75rem",
    gap: "0.25rem",
    justifyContent: "center",
    lineHeight: "1rem",
    minWidth: 0,
  },
  gutter: {
    flexShrink: 0,
    width: "var(--calendar-gutter-width)",
  },
  placed: {
    display: "grid",
    insetBlock: 0,
    position: "absolute",
  },
  row: {
    display: "flex",
    height: "1.75rem",
  },
  today: {
    color: calendarVars["--calendar-today"],
  },
  track: {
    height: "100%",
    position: "relative",
  },
  weekday: {
    color: calendarVars["--muted-foreground"],
    fontWeight: 500,
    textTransform: "uppercase",
  },
});

export interface ResourceColumnsDatesProps {
  readonly days: readonly TimeGridDay<unknown>[];
  /** Follows the body's sideways scroll; see `useAxisSync`. */
  readonly followX: RefCallback<HTMLElement>;
  /** The rendered columns, from the column virtualizer. */
  readonly items: readonly VirtualItem[];
  readonly locale: Intl.LocalesArgument;
  readonly scrollbarWidth: number;
  readonly totalSize: number;
  /** The root's secondary time zones; a day whose times in one differ from the gutter's says so. */
  readonly zones?: readonly TimeGridZone[];
}

const noZones: readonly TimeGridZone[] = [];

/** Over several days, the weekday and date of each of a resource's day columns. */
export function ResourceColumnsDates({
  days,
  followX,
  items,
  locale,
  scrollbarWidth,
  totalSize,
  zones = noZones,
}: ResourceColumnsDatesProps) {
  const notes = useMemo(() => zoneNotesByDate(zones), [zones]);
  const formats = useMemo(
    () => ({
      full: new Intl.DateTimeFormat(locale, { dateStyle: "full" }),
      weekday: new Intl.DateTimeFormat(locale, { weekday: "short" }),
    }),
    [locale],
  );

  return (
    <div role="row" {...stylex.props(styles.row)}>
      <div role="columnheader" aria-colindex={1} {...stylex.props(styles.gutter)}>
        <VisuallyHidden>Date</VisuallyHidden>
      </div>
      <div {...stylex.props(styles.clip)} style={{ marginInlineEnd: scrollbarWidth }}>
        <div ref={followX} {...stylex.props(styles.track)} style={{ width: totalSize }}>
          {items.map(({ index, key, size, start }) => (
            <div
              key={key}
              {...stylex.props(styles.placed)}
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
                  {...stylex.props(styles.day)}
                >
                  <span {...stylex.props(styles.weekday, isToday && styles.today)}>
                    {formats.weekday.format(date)}
                  </span>
                  <span {...stylex.props(styles.date, isToday && styles.dateToday)}>
                    {date.day}
                  </span>
                  <TimeGridZoneNotes notes={notes.get(date.toString())} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
