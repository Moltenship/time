import type { CalendarEnvironmentBase, PlainDateInterval, ResourceId } from "@moltenship/calendar";
import { useCallback, useMemo, type CSSProperties } from "react";

import { ResourceTimelineHeader } from "./resource-timeline-header";
import { ResourceTimelineRow, type TimelineResourceRow } from "./resource-timeline-row";
import { useTimelineLabels } from "./timeline-labels";
import {
  defaultSlotUnit,
  timelineSlotGroups,
  timelineSlots,
  type TimelineSlotUnit,
} from "./timeline-scale";
import { useTimelineVirtualizer } from "./use-timeline-virtualizer";

export interface ResourceTimelineGridProps {
  readonly environment: CalendarEnvironmentBase;
  /** The grid's accessible name, such as the visible range. */
  readonly label: string;
  /** Shows or hides a group's children. */
  readonly onToggleResource: (resourceId: ResourceId) => void;
  readonly range: PlainDateInterval;
  /** The visible resources, in order, with their depth in the hierarchy. */
  readonly rows: readonly TimelineResourceRow[];
  readonly today: Temporal.PlainDate | null;
  /** What a column spans; by default hours for a single day and days for longer ranges. */
  readonly unit?: TimelineSlotUnit;
}

/** Row height and the two-line header's height, in pixels. */
const ROW_HEIGHT = 44;
const HEADER_HEIGHT = 64;
/** The narrowest a slot gets before the timeline scrolls sideways. */
const MIN_SLOT_WIDTH: Readonly<Record<TimelineSlotUnit, number>> = { day: 48, hour: 56 };

const rowHeight = () => ROW_HEIGHT;

/**
 * Resources as rows and time as columns in one scrolling viewport. The header and the resource
 * column are sticky, and only the rows and slots in view render, so 500 resources over a month
 * stay as light as a dozen. The time axis runs in the calendar's direction.
 */
export function ResourceTimelineGrid({
  environment,
  label,
  onToggleResource,
  range,
  rows,
  today,
  unit = defaultSlotUnit(range),
}: ResourceTimelineGridProps) {
  const { direction, locale, weekRules } = environment;
  const slots = useMemo(() => timelineSlots(range, unit), [range, unit]);
  const groups = useMemo(() => timelineSlotGroups(slots, unit), [slots, unit]);
  const labels = useTimelineLabels(locale, unit);
  const rowKey = useCallback(
    (index: number) => `${typeof rows[index]!.id}:${rows[index]!.id}`,
    [rows],
  );
  const slotKey = useCallback((index: number) => slots[index]!.key, [slots]);
  const { columnWidth, rowAxis, slotWidth, timeAxis, viewportRef } = useTimelineVirtualizer({
    direction,
    headerHeight: HEADER_HEIGHT,
    rows: { count: rows.length, height: rowHeight, key: rowKey },
    slots: { count: slots.length, key: slotKey, minWidth: MIN_SLOT_WIDTH[unit] },
  });
  const visibleSlots = timeAxis.getVirtualItems();

  return (
    <div
      role="grid"
      aria-colcount={slots.length + 1}
      aria-label={label}
      aria-rowcount={rows.length + 1}
      data-slot="resource-timeline"
      dir={direction}
      className="flex h-full min-h-0 flex-col"
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
        <div
          className="relative"
          style={{ height: rowAxis.getTotalSize(), width: timeAxis.getTotalSize() }}
        >
          <ResourceTimelineHeader
            groups={groups}
            labels={labels}
            slotWidth={slotWidth}
            slots={slots}
            today={today}
            unit={unit}
            visibleSlots={visibleSlots}
          />
          {rowAxis.getVirtualItems().map((virtualRow) => (
            <ResourceTimelineRow
              key={virtualRow.key}
              labels={labels}
              onToggle={onToggleResource}
              row={rows[virtualRow.index]!}
              slots={slots}
              unit={unit}
              virtualRow={virtualRow}
              visibleSlots={visibleSlots}
              weekend={weekRules.weekend}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
