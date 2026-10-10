import { resourceIdAttributes, type ResourceColumn } from "@moltenship/calendar";
import type { VirtualItem } from "@tanstack/react-virtual";
import { useMemo, type RefCallback } from "react";

import type { EventLabeler } from "@registry/calendar/event-label";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import {
  AllDayRowHeader,
  TimeGridAllDayCells,
  useAllDayCollapse,
} from "@registry/time-grid-view/time-grid-all-day";

import { resourceTitle } from "./resource-columns-header";

export interface ResourceColumnsAllDayProps<TEvent> {
  /** Follows the body's sideways scroll; see `useAxisSync`. */
  readonly followX: RefCallback<HTMLElement>;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
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
export function ResourceColumnsAllDay<TEvent>({
  followX,
  getEventColor,
  items,
  labelEvent,
  locale,
  resources,
  scrollbarWidth,
  totalSize,
}: ResourceColumnsAllDayProps<TEvent>) {
  const days = resources[0]?.days ?? [];
  const rows = useMemo(
    () => resources.map(({ allDay, resource }) => ({ resourceId: resource.id, row: allDay })),
    [resources],
  );
  const collapse = useAllDayCollapse(days, rows);
  const format = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "full" }), [locale]);

  return (
    <div role="row" className="flex" style={{ height: collapse.height }}>
      <AllDayRowHeader collapse={collapse} />
      <div
        className="relative min-w-0 flex-1 overflow-clip"
        style={{ marginInlineEnd: scrollbarWidth }}
      >
        <div ref={followX} className="relative h-full" style={{ width: totalSize }}>
          {items.map(({ index, key, size, start }) => {
            const { allDay, resource } = resources[index]!;
            const title = resourceTitle(resource);
            return (
              <div
                key={key}
                {...resourceIdAttributes(resource.id)}
                className="absolute inset-y-0 flex"
                style={{ insetInlineStart: start, width: size }}
              >
                <TimeGridAllDayCells
                  colIndex={2 + index * days.length}
                  days={days}
                  formatDate={(date) => `${title}, ${format.format(date)}`}
                  getEventColor={getEventColor}
                  labelEvent={(event) => labelEvent(event, title)}
                  onExpand={collapse.expand}
                  overflow={collapse.overflows[index]!}
                  resourceId={resource.id}
                  row={allDay}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
