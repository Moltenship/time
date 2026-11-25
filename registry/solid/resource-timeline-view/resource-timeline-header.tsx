import type { VirtualItem } from "@tanstack/virtual-core";
import { For, Show } from "solid-js";

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
import { boxStyle, slotGroupBox } from "@registry/shared/resource-timeline-view/timeline-placement";
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
export function ResourceTimelineHeader(props: ResourceTimelineHeaderProps) {
  return (
    <div
      role="row"
      aria-rowindex={1}
      // Rows scroll beneath it, so the pointer layer doesn't look through it to them.
      data-occludes=""
      data-slot="resource-timeline-header"
      class={timelineHeaderClass}
    >
      <div role="columnheader" aria-colindex={1} class={timelineCornerClass}>
        {resourcesHeading}
      </div>
      <div aria-hidden="true" class={timelineGroupsClass}>
        <For each={props.groups} keyed={(group) => group.key}>
          {(group) => (
            <div
              class={timelineGroupClass}
              style={boxStyle(slotGroupBox(group().first, group().count, props.slotWidth))}
            >
              <span class={timelineGroupLabelClass}>
                <bdi>{props.labels.group(group())}</bdi>
              </span>
            </div>
          )}
        </For>
      </div>
      <For each={props.visibleSlots} keyed={(item) => item.key}>
        {(item) => {
          const slot = () => props.slots[item().index]!;
          const isToday = () =>
            props.unit === "day" && props.today !== null && slot().date.equals(props.today);
          return (
            <div
              role="columnheader"
              aria-colindex={item().index + 2}
              aria-current={isToday() ? "date" : undefined}
              aria-label={props.labels.slotName(slot())}
              class={timelineSlotHeaderClass(props.unit)}
              style={boxStyle({ insetInlineStart: item().start, width: item().size })}
            >
              <Show
                when={props.unit === "day"}
                // Isolated, so "11 PM" keeps its order in a right-to-left layout.
                fallback={<bdi>{props.labels.slot(slot())}</bdi>}
              >
                <span class={timelineWeekdayClass}>{props.labels.slot(slot())}</span>
                <span class={timelineDayNumberClass(isToday())}>{slot().date.day}</span>
              </Show>
            </div>
          );
        }}
      </For>
    </div>
  );
}
