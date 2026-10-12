import type { VirtualItem } from "@tanstack/react-virtual";
import { memo } from "react";

import { cn } from "cn";

import type { TimelineLabels } from "./timeline-labels";
import type { TimelineSlot, TimelineSlotGroup, TimelineSlotUnit } from "./timeline-scale";

export interface ResourceTimelineHeaderProps {
  readonly groups: readonly TimelineSlotGroup[];
  readonly labels: TimelineLabels;
  /** Width of each slot, in pixels. */
  readonly slotWidth: number;
  readonly slots: readonly TimelineSlot[];
  readonly today: Temporal.PlainDate | null;
  readonly unit: TimelineSlotUnit;
  /** The slots in view. */
  readonly visibleSlots: readonly VirtualItem[];
}

/**
 * The timeline's sticky header row: a corner over the resource column, then dates (over hours) or
 * months (over days), and a label for each slot in view. A group's label stays in view while any
 * of its slots does.
 */
export const ResourceTimelineHeader = memo(function ResourceTimelineHeader({
  groups,
  labels,
  slotWidth,
  slots,
  today,
  unit,
  visibleSlots,
}: ResourceTimelineHeaderProps) {
  return (
    <div
      role="row"
      aria-rowindex={1}
      // Rows scroll beneath it, so the pointer layer doesn't look through it to them.
      data-occludes=""
      data-slot="resource-timeline-header"
      className="sticky top-0 z-40 flex h-(--calendar-timeline-header) border-b border-calendar-grid bg-calendar-surface"
    >
      <div
        role="columnheader"
        aria-colindex={1}
        className="sticky start-0 z-10 flex w-(--calendar-resource-column) shrink-0 items-end border-e border-calendar-grid bg-calendar-surface px-3 pb-2 text-xs font-medium text-muted-foreground"
      >
        Resources
      </div>
      <div aria-hidden className="absolute inset-x-0 top-0 h-6">
        {groups.map((group) => (
          <div
            key={group.key}
            className="absolute inset-y-0 border-s border-calendar-grid"
            style={{
              insetInlineStart: `calc(var(--calendar-resource-column) + ${group.first * slotWidth}px)`,
              width: group.count * slotWidth,
            }}
          >
            <span className="sticky start-(--calendar-resource-column) inline-block px-2 pt-1 text-xs font-medium whitespace-nowrap">
              <bdi>{labels.group(group)}</bdi>
            </span>
          </div>
        ))}
      </div>
      {visibleSlots.map((item) => {
        const slot = slots[item.index]!;
        const isToday = unit === "day" && today !== null && slot.date.equals(today);
        return (
          <div
            key={item.key}
            role="columnheader"
            aria-colindex={item.index + 2}
            aria-current={isToday ? "date" : undefined}
            aria-label={labels.slotName(slot)}
            className={cn(
              "absolute bottom-0 flex h-10 overflow-hidden border-s border-calendar-grid text-xs whitespace-nowrap text-calendar-axis tabular-nums",
              unit === "day" ? "flex-col items-center justify-center" : "items-center px-2",
            )}
            style={{ insetInlineStart: item.start, width: item.size }}
          >
            {unit === "day" ? (
              <>
                <span className="text-[0.6875rem] leading-none font-medium uppercase">
                  {labels.slot(slot)}
                </span>
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-sm text-foreground",
                    isToday && "bg-calendar-today text-calendar-today-foreground",
                  )}
                >
                  {slot.date.day}
                </span>
              </>
            ) : (
              // Isolated, so "11 PM" keeps its order in a right-to-left layout.
              <bdi>{labels.slot(slot)}</bdi>
            )}
          </div>
        );
      })}
    </div>
  );
});
