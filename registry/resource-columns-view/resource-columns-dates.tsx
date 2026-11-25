"use client";

import type { TimeGridDay } from "@moltenship/calendar";
import type { VirtualItem } from "@tanstack/virtual-core";
import { useMemo, type RefCallback } from "react";

import { datesLabel } from "@registry/shared/resource-columns-view/resource-columns-labels";
import { resourceColIndex } from "@registry/shared/resource-columns-view/resource-columns-layout";
import {
  resourceColumnsClipClass,
  resourceColumnsTrackClass,
  resourceDateClass,
  resourceDatesCornerClass,
  resourceDatesRowClass,
  resourceDayNumberClass,
  resourceDaysClass,
  resourceWeekdayClass,
} from "@registry/shared/resource-columns-view/resource-columns.styles";
import { dayColumns } from "@registry/shared/time-grid-view/time-grid-geometry";
import { dayHeaderFormats } from "@registry/shared/time-grid-view/time-grid-labels";
import { srOnlyClass } from "@registry/shared/time-grid-view/time-grid.styles";
import {
  TimeGridZoneNotes,
  zoneNotesByDate,
  type TimeGridZone,
} from "@registry/time-grid-view/time-grid-zones";

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
  const formats = useMemo(() => dayHeaderFormats(locale), [locale]);

  return (
    <div role="row" className={resourceDatesRowClass}>
      <div role="columnheader" aria-colindex={1} className={resourceDatesCornerClass}>
        <span className={srOnlyClass}>{datesLabel}</span>
      </div>
      <div className={resourceColumnsClipClass} style={{ marginInlineEnd: scrollbarWidth }}>
        <div ref={followX} className={resourceColumnsTrackClass} style={{ width: totalSize }}>
          {items.map(({ index, key, size, start }) => (
            <div
              key={key}
              className={resourceDaysClass}
              style={{
                gridTemplateColumns: dayColumns(days.length),
                insetInlineStart: start,
                width: size,
              }}
            >
              {days.map(({ column: { date, key: dayKey }, isToday }, day) => (
                <div
                  key={dayKey}
                  role="columnheader"
                  aria-colindex={resourceColIndex(index, days.length) + day}
                  aria-current={isToday ? "date" : undefined}
                  aria-label={formats.full.format(date)}
                  className={resourceDateClass}
                >
                  <span className={resourceWeekdayClass(isToday)}>
                    {formats.weekday.format(date)}
                  </span>
                  <span className={resourceDayNumberClass(isToday)}>{date.day}</span>
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
