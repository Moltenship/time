import type { TimeGridDay } from "@moltenship/calendar-solid";
import type { VirtualItem } from "@tanstack/virtual-core";
import { createMemo, For } from "solid-js";

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
import { zoneNotesByDate } from "@registry/shared/time-grid-view/secondary-zones";
import { dayColumns } from "@registry/shared/time-grid-view/time-grid-geometry";
import { dayHeaderFormats } from "@registry/shared/time-grid-view/time-grid-labels";
import { srOnlyClass } from "@registry/shared/time-grid-view/time-grid.styles";
import { TimeGridZoneNotes, type TimeGridZone } from "@registry/time-grid-view/time-grid-zones";

import type { AxisFollower } from "./use-axis-sync";

export interface ResourceColumnsDatesProps {
  readonly days: readonly TimeGridDay<unknown>[];
  /** Follows the body's sideways scroll; see `useAxisSync`. */
  readonly followX: AxisFollower;
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
export function ResourceColumnsDates(props: ResourceColumnsDatesProps) {
  const notes = createMemo(() => zoneNotesByDate(props.zones ?? noZones));
  const formats = createMemo(() => dayHeaderFormats(props.locale));
  const track = props.followX();

  return (
    <div role="row" class={resourceDatesRowClass}>
      <div role="columnheader" aria-colindex={1} class={resourceDatesCornerClass}>
        <span class={srOnlyClass}>{datesLabel}</span>
      </div>
      <div
        class={resourceColumnsClipClass}
        style={{ "margin-inline-end": `${props.scrollbarWidth}px` }}
      >
        <div
          ref={track}
          class={resourceColumnsTrackClass}
          style={{ width: `${props.totalSize}px` }}
        >
          <For each={props.items} keyed={(item) => item.key}>
            {(item) => (
              <div
                class={resourceDaysClass}
                style={{
                  "grid-template-columns": dayColumns(props.days.length),
                  "inset-inline-start": `${item().start}px`,
                  width: `${item().size}px`,
                }}
              >
                <For each={props.days} keyed={(day) => day.column.key}>
                  {(day, index) => (
                    <div
                      role="columnheader"
                      aria-colindex={resourceColIndex(item().index, props.days.length) + index()}
                      aria-current={day().isToday ? "date" : undefined}
                      aria-label={formats().full.format(day().column.date)}
                      class={resourceDateClass}
                    >
                      <span class={resourceWeekdayClass(day().isToday)}>
                        {formats().weekday.format(day().column.date)}
                      </span>
                      <span class={resourceDayNumberClass(day().isToday)}>
                        {day().column.date.day}
                      </span>
                      <TimeGridZoneNotes notes={notes().get(day().column.date.toString())} />
                    </div>
                  )}
                </For>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}
