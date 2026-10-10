import type { IsoDayOfWeek, ResourceId } from "@moltenship/calendar";
import type { VirtualItem } from "@tanstack/react-virtual";
import { ChevronRightIcon } from "lucide-react";
import { memo } from "react";

import { cn } from "cn";
import { Button } from "@registry/ui/button";

import type { TimelineLabels } from "./timeline-labels";
import type { TimelineSlot, TimelineSlotUnit } from "./timeline-scale";

/** A visible resource row: a resource at its depth in the hierarchy. */
export interface TimelineResourceRow {
  /** 0 for a top-level resource. */
  readonly depth: number;
  /** Whether the resource's children show; `undefined` for a resource without children. */
  readonly expanded?: boolean;
  readonly id: ResourceId;
  readonly title: string;
}

export interface ResourceTimelineRowProps {
  readonly labels: TimelineLabels;
  /** Shows or hides a group's children. */
  readonly onToggle: (resourceId: ResourceId) => void;
  readonly row: TimelineResourceRow;
  readonly slots: readonly TimelineSlot[];
  readonly unit: TimelineSlotUnit;
  /** Where the row sits among all rows, and how tall it is. */
  readonly virtualRow: VirtualItem;
  /** The slots in view. */
  readonly visibleSlots: readonly VirtualItem[];
  readonly weekend: readonly IsoDayOfWeek[];
}

/**
 * One resource: its name in the sticky resource column, indented by depth, with a toggle when it
 * has children, then a cell for each slot in view. Group rows are tinted.
 */
export const ResourceTimelineRow = memo(function ResourceTimelineRow({
  labels,
  onToggle,
  row,
  slots,
  unit,
  virtualRow,
  visibleSlots,
  weekend,
}: ResourceTimelineRowProps) {
  const group = row.expanded !== undefined;

  return (
    <div
      role="row"
      aria-label={row.title}
      aria-rowindex={virtualRow.index + 2}
      data-resource-id={row.id}
      className={cn(
        "absolute inset-x-0 flex border-b border-calendar-grid",
        group && "bg-muted/50",
      )}
      style={{ height: virtualRow.size, top: virtualRow.start }}
    >
      <div
        role="rowheader"
        aria-colindex={1}
        aria-label={row.title}
        className={cn(
          "sticky start-0 z-30 flex w-(--calendar-resource-column) shrink-0 items-center gap-1 border-e border-calendar-grid bg-background pe-2 text-sm",
          group && "bg-muted font-medium",
        )}
        style={{ paddingInlineStart: `${0.25 + row.depth}rem` }}
      >
        {group ? (
          <Button
            aria-expanded={row.expanded}
            aria-label={`${row.expanded ? "Collapse" : "Expand"} ${row.title}`}
            onClick={() => onToggle(row.id)}
            size="icon-xs"
            variant="ghost"
          >
            <ChevronRightIcon
              className={cn("transition-transform", row.expanded ? "rotate-90" : "rtl:rotate-180")}
            />
          </Button>
        ) : (
          <span aria-hidden className="size-6 shrink-0" />
        )}
        <span className="truncate">{row.title}</span>
      </div>
      {visibleSlots.map((item) => {
        const slot = slots[item.index]!;
        return (
          <div
            key={item.key}
            role="gridcell"
            aria-colindex={item.index + 2}
            aria-label={`${row.title}, ${labels.slotName(slot)}`}
            data-weekend={
              unit === "day" && weekend.includes(slot.date.dayOfWeek as IsoDayOfWeek)
                ? ""
                : undefined
            }
            className="absolute inset-y-0 border-s border-calendar-grid data-weekend:bg-calendar-weekend"
            style={{ insetInlineStart: item.start, width: item.size }}
          />
        );
      })}
    </div>
  );
});
