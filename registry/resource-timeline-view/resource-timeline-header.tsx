import type { VirtualItem } from "@tanstack/virtual-core";
import { memo } from "react";

import {
  timelineCornerClass,
  timelineDayNumberClass,
  timelineGroupClass,
  timelineGroupLabelClass,
  timelineGroupsClass,
  timelineHeaderClass,
  timelineSlotHeaderClass,
  timelineWeekdayClass,
} from "@registry/shared/resource-timeline-view/resource-timeline.styles";
import {
  resourcesHeading,
  type TimelineLabels,
} from "@registry/shared/resource-timeline-view/timeline-labels";
import { slotGroupBox } from "@registry/shared/resource-timeline-view/timeline-placement";
import type {
  TimelineSlot,
  TimelineSlotGroup,
  TimelineSlotUnit,
} from "@registry/shared/resource-timeline-view/timeline-scale";

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
      className={timelineHeaderClass}
    >
      <div role="columnheader" aria-colindex={1} className={timelineCornerClass}>
        {resourcesHeading}
      </div>
      <div aria-hidden className={timelineGroupsClass}>
        {groups.map((group) => (
          <div
            key={group.key}
            className={timelineGroupClass}
            style={slotGroupBox(group.first, group.count, slotWidth)}
          >
            <span className={timelineGroupLabelClass}>
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
            className={timelineSlotHeaderClass(unit)}
            style={{ insetInlineStart: item.start, width: item.size }}
          >
            {unit === "day" ? (
              <>
                <span className={timelineWeekdayClass}>{labels.slot(slot)}</span>
                <span className={timelineDayNumberClass(isToday)}>{slot.date.day}</span>
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
