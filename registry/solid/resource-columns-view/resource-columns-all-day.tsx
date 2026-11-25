import { resourceIdAttributes, type ResourceColumn } from "@moltenship/calendar-solid";
import type { JSX } from "@solidjs/web";
import type { VirtualItem } from "@tanstack/virtual-core";
import { createMemo, For } from "solid-js";

import type { EventLabeler } from "@registry/calendar/event-label";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import {
  resourceDateLabel,
  resourceTitle,
} from "@registry/shared/resource-columns-view/resource-columns-labels";
import { resourceColIndex } from "@registry/shared/resource-columns-view/resource-columns-layout";
import {
  resourceAllDayColumnClass,
  resourceAllDayRowClass,
  resourceColumnsClipClass,
  resourceColumnsTrackClass,
} from "@registry/shared/resource-columns-view/resource-columns.styles";
import { fullDateFormat } from "@registry/shared/time-grid-view/time-grid-labels";
import {
  AllDayRowHeader,
  TimeGridAllDayCells,
  useAllDayCollapse,
} from "@registry/time-grid-view/time-grid-all-day";

import type { AxisFollower } from "./use-axis-sync";

export interface ResourceColumnsAllDayProps<TEvent> {
  /** Follows the body's sideways scroll; see `useAxisSync`. */
  readonly followX: AxisFollower;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
  readonly getEventIcon?: (event: TEvent) => JSX.Element;
  /** The rendered columns, from the column virtualizer. */
  readonly items: readonly VirtualItem[];
  readonly labelEvent: EventLabeler<TEvent>;
  readonly locale: Intl.LocalesArgument;
  readonly resources: readonly ResourceColumn<TEvent>[];
  readonly scrollbarWidth: number;
  readonly totalSize: number;
}

/**
 * The all-day row: each rendered resource's all-day and multi-day events over its days. Every
 * resource collapses to three lanes together, so the row keeps one height while it scrolls.
 */
export function ResourceColumnsAllDay<TEvent>(props: ResourceColumnsAllDayProps<TEvent>) {
  const days = () => props.resources[0]?.days ?? [];
  const rows = createMemo(() =>
    props.resources.map(({ allDay, resource }) => ({ resourceId: resource.id, row: allDay })),
  );
  const collapse = useAllDayCollapse(days, rows);
  const formatDate = createMemo(() => fullDateFormat(props.locale));
  const track = props.followX();

  return (
    <div role="row" class={resourceAllDayRowClass} style={{ height: collapse.height }}>
      <AllDayRowHeader collapse={collapse} />
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
            {(item) => {
              const column = () => props.resources[item().index]!;
              const title = () => resourceTitle(column().resource);
              return (
                <div
                  {...resourceIdAttributes(column().resource.id)}
                  class={resourceAllDayColumnClass}
                  style={{
                    "inset-inline-start": `${item().start}px`,
                    width: `${item().size}px`,
                  }}
                >
                  <TimeGridAllDayCells
                    colIndex={resourceColIndex(item().index, days().length)}
                    days={days()}
                    formatDate={(date) => resourceDateLabel(title(), formatDate()(date))}
                    getEventColor={props.getEventColor}
                    getEventIcon={props.getEventIcon}
                    labelEvent={(event) => props.labelEvent(event, title())}
                    onExpand={collapse.expand}
                    overflow={collapse.overflows[item().index] ?? null}
                    resourceId={column().resource.id}
                    row={column().allDay}
                  />
                </div>
              );
            }}
          </For>
        </div>
      </div>
    </div>
  );
}
