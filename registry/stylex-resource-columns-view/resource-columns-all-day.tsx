"use client";

import { resourceIdAttributes, type ResourceColumn } from "@moltenship/calendar";
import * as stylex from "@stylexjs/stylex";
import type { VirtualItem } from "@tanstack/react-virtual";
import { useMemo, type ReactNode, type RefCallback } from "react";

import type { EventLabeler } from "@registry/stylex-calendar/event-label";
import type { CalendarEventColor } from "@registry/stylex-calendar-theme/event-colors";
import {
  AllDayRowHeader,
  TimeGridAllDayCells,
  useAllDayCollapse,
} from "@registry/stylex-time-grid-view/time-grid-all-day";

import { resourceTitle } from "./resource-columns-header";

const styles = stylex.create({
  clip: {
    flex: "1",
    minWidth: 0,
    overflow: "clip",
    position: "relative",
  },
  placed: {
    display: "flex",
    insetBlock: 0,
    position: "absolute",
  },
  row: {
    display: "flex",
  },
  track: {
    height: "100%",
    position: "relative",
  },
});

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
  const format = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "full" }), [locale]);

  return (
    <div role="row" {...stylex.props(styles.row)} style={{ height: collapse.height }}>
      <AllDayRowHeader collapse={collapse} />
      <div {...stylex.props(styles.clip)} style={{ marginInlineEnd: scrollbarWidth }}>
        <div ref={followX} {...stylex.props(styles.track)} style={{ width: totalSize }}>
          {items.map(({ index, key, size, start }) => {
            const { allDay, resource } = resources[index]!;
            const title = resourceTitle(resource);
            return (
              <div
                key={key}
                {...resourceIdAttributes(resource.id)}
                {...stylex.props(styles.placed)}
                style={{ insetInlineStart: start, width: size }}
              >
                <TimeGridAllDayCells
                  colIndex={2 + index * days.length}
                  days={days}
                  formatDate={(date) => `${title}, ${format.format(date)}`}
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
