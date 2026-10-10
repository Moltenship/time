import type { CalendarEnvironmentBase, PlainDateInterval } from "@moltenship/calendar";
import { useCallback, useMemo, type CSSProperties, type Ref } from "react";

import type { EventLabeler } from "@registry/calendar/event-label";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";

import { LANE_GAP, LANE_HEIGHT, ROW_PADDING } from "./resource-timeline-event";
import { ResourceTimelineHeader } from "./resource-timeline-header";
import { ResourceTimelineRow } from "./resource-timeline-row";
import { useTimelineLabels } from "./timeline-labels";
import type { ResourceTimelineRow as Row } from "./timeline-rows";
import { timelineSlotGroups, timelineSlots } from "./timeline-scale";
import { useTimelineVirtualizer } from "./use-timeline-virtualizer";

export interface ResourceTimelineGridProps<TEvent> {
  readonly environment: CalendarEnvironmentBase;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
  /** The grid's accessible name, such as the visible range. */
  readonly label: string;
  readonly labelEvent: EventLabeler<TEvent>;
  /** Where now falls along the range, from 0 at its start to 1 at its end; `null` outside it. */
  readonly now: number | null;
  readonly range: PlainDateInterval;
  /** The grid element, for the pointer layer. */
  readonly ref?: Ref<HTMLDivElement>;
  /** The visible resources, in order, with their events packed into lanes. */
  readonly rows: readonly Row<TEvent>[];
  readonly today: Temporal.PlainDate | null;
}

/** The shortest row, and the two-line header's height, in pixels. */
const MIN_ROW_HEIGHT = 44;
const HEADER_HEIGHT = 64;
/** The narrowest a day gets before the timeline scrolls sideways. */
const MIN_DAY_WIDTH = 48;

/** A row tall enough for its lanes, and never shorter than an empty one. */
function rowHeight(laneCount: number): number {
  return Math.max(MIN_ROW_HEIGHT, 2 * ROW_PADDING + laneCount * (LANE_HEIGHT + LANE_GAP));
}

/**
 * Resources as rows and days as columns in one scrolling viewport. The header and the resource
 * column are sticky, and only the rows and days in view render, so 500 resources over a month
 * stay as light as a dozen. Rows grow to fit their lanes, and the time axis runs in the
 * calendar's direction.
 */
export function ResourceTimelineGrid<TEvent>({
  environment,
  getEventColor,
  label,
  labelEvent,
  now,
  range,
  ref,
  rows,
  today,
}: ResourceTimelineGridProps<TEvent>) {
  const { direction, locale, timeZone, weekRules } = environment;
  const slots = useMemo(() => timelineSlots(range, "day"), [range]);
  const groups = useMemo(() => timelineSlotGroups(slots, "day"), [slots]);
  const labels = useTimelineLabels(locale, "day");
  const formatTime = useMemo(() => {
    const format = new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    });
    return (instant: Temporal.Instant) => format.format(instant);
  }, [locale, timeZone]);
  const rowKey = useCallback((index: number) => rows[index]!.resource.key, [rows]);
  const rowSize = useCallback((index: number) => rowHeight(rows[index]!.laneCount), [rows]);
  const slotKey = useCallback((index: number) => slots[index]!.key, [slots]);
  const { columnWidth, rowAxis, slotWidth, timeAxis, viewportRef } = useTimelineVirtualizer({
    direction,
    headerHeight: HEADER_HEIGHT,
    rows: { count: rows.length, height: rowSize, key: rowKey },
    slots: { count: slots.length, key: slotKey, minWidth: MIN_DAY_WIDTH },
  });
  const visibleSlots = timeAxis.getVirtualItems();
  const height = rowAxis.getTotalSize();

  return (
    <div
      ref={ref}
      role="grid"
      aria-colcount={slots.length + 1}
      aria-label={label}
      aria-rowcount={rows.length + 1}
      data-slot="resource-timeline"
      dir={direction}
      className="flex h-full min-h-0 flex-col [--calendar-ghost-background:var(--calendar-selection)] data-interaction:select-none data-[interaction=move]:cursor-grabbing data-[interaction=resize]:cursor-ew-resize"
      style={
        {
          "--calendar-resource-column": `${columnWidth}px`,
          "--calendar-timeline-header": `${HEADER_HEIGHT}px`,
        } as CSSProperties
      }
    >
      <div
        ref={viewportRef}
        data-slot="resource-timeline-viewport"
        className="relative min-h-0 flex-1 overflow-auto overscroll-contain"
      >
        <div className="relative" style={{ height, width: timeAxis.getTotalSize() }}>
          <ResourceTimelineHeader
            groups={groups}
            labels={labels}
            slotWidth={slotWidth}
            slots={slots}
            today={today}
            unit="day"
            visibleSlots={visibleSlots}
          />
          {rowAxis.getVirtualItems().map((virtualRow) => (
            <ResourceTimelineRow
              key={virtualRow.key}
              formatTime={formatTime}
              getEventColor={getEventColor}
              labelEvent={labelEvent}
              labels={labels}
              row={rows[virtualRow.index]!}
              slotWidth={slotWidth}
              slots={slots}
              virtualRow={virtualRow}
              visibleSlots={visibleSlots}
              weekend={weekRules.weekend}
            />
          ))}
          {now !== null && (
            <div
              aria-hidden
              data-slot="resource-timeline-now"
              className="pointer-events-none absolute z-20 w-0.5 -translate-x-1/2 bg-calendar-now rtl:translate-x-1/2"
              style={{
                height: height - HEADER_HEIGHT,
                insetInlineStart: columnWidth + now * slots.length * slotWidth,
                top: HEADER_HEIGHT,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
