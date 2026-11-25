"use client";

import { resourceIdAttributes, type ResourceColumn } from "@moltenship/calendar";
import type { VirtualItem } from "@tanstack/virtual-core";
import { useMemo, type ReactNode, type RefCallback } from "react";

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

export interface ResourceColumnsAllDayProps<TEvent> {
  /** Follows the body's sideways scroll; see `useAxisSync`. */
  readonly followX: RefCallback<HTMLElement>;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
  readonly getEventIcon?: (event: TEvent) => ReactNode;
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
  getEventIcon,
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
  const formatDate = useMemo(() => fullDateFormat(locale), [locale]);

  return (
    <div role="row" className={resourceAllDayRowClass} style={{ height: collapse.height }}>
      <AllDayRowHeader collapse={collapse} />
      <div className={resourceColumnsClipClass} style={{ marginInlineEnd: scrollbarWidth }}>
        <div ref={followX} className={resourceColumnsTrackClass} style={{ width: totalSize }}>
          {items.map(({ index, key, size, start }) => {
            const { allDay, resource } = resources[index]!;
            const title = resourceTitle(resource);
            return (
              <div
                key={key}
                {...resourceIdAttributes(resource.id)}
                className={resourceAllDayColumnClass}
                style={{ insetInlineStart: start, width: size }}
              >
                <TimeGridAllDayCells
                  colIndex={resourceColIndex(index, days.length)}
                  days={days}
                  formatDate={(date) => resourceDateLabel(title, formatDate(date))}
                  getEventColor={getEventColor}
                  getEventIcon={getEventIcon}
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
