import * as stylex from "@stylexjs/stylex";
import type { VirtualItem } from "@tanstack/react-virtual";
import { memo } from "react";

import {
  calendarConsts,
  calendarVars,
} from "@registry/stylex-calendar-theme/calendar-tokens.stylex";

import type { TimelineLabels } from "./timeline-labels";
import type { TimelineSlot, TimelineSlotGroup, TimelineSlotUnit } from "./timeline-scale";

const styles = stylex.create({
  corner: {
    alignItems: "flex-end",
    backgroundColor: calendarConsts.surface,
    borderInlineEndColor: calendarVars["--calendar-grid"],
    borderInlineEndStyle: "solid",
    borderInlineEndWidth: 1,
    color: calendarVars["--muted-foreground"],
    display: "flex",
    flexShrink: 0,
    fontSize: "0.75rem",
    fontWeight: 500,
    insetInlineStart: 0,
    lineHeight: "1rem",
    paddingBottom: "0.5rem",
    paddingInline: "0.75rem",
    position: "sticky",
    width: "var(--calendar-resource-column)",
    zIndex: 10,
  },
  dayLabel: {
    fontSize: "0.6875rem",
    fontWeight: 500,
    lineHeight: 1,
    textTransform: "uppercase",
  },
  dayNumber: {
    alignItems: "center",
    borderRadius: "9999px",
    color: calendarVars["--foreground"],
    display: "flex",
    fontSize: "0.875rem",
    height: "1.5rem",
    justifyContent: "center",
    lineHeight: "1.25rem",
    width: "1.5rem",
  },
  dayNumberToday: {
    backgroundColor: calendarVars["--calendar-today"],
    color: calendarVars["--calendar-today-foreground"],
  },
  group: {
    borderInlineStartColor: calendarVars["--calendar-grid"],
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: 1,
    insetBlock: 0,
    position: "absolute",
  },
  groupLabel: {
    display: "inline-block",
    fontSize: "0.75rem",
    fontWeight: 500,
    insetInlineStart: "var(--calendar-resource-column)",
    lineHeight: "1rem",
    paddingInline: "0.5rem",
    paddingTop: "0.25rem",
    position: "sticky",
    whiteSpace: "nowrap",
  },
  groups: {
    height: "1.5rem",
    insetInline: 0,
    position: "absolute",
    top: 0,
  },
  header: {
    backgroundColor: calendarConsts.surface,
    borderBottomColor: calendarVars["--calendar-grid"],
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "flex",
    height: "var(--calendar-timeline-header)",
    position: "sticky",
    top: 0,
    zIndex: 40,
  },
  slot: {
    borderInlineStartColor: calendarVars["--calendar-grid"],
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: 1,
    bottom: 0,
    color: calendarVars["--calendar-axis"],
    display: "flex",
    fontSize: "0.75rem",
    fontVariantNumeric: "tabular-nums",
    height: "2.5rem",
    lineHeight: "1rem",
    overflow: "hidden",
    position: "absolute",
    whiteSpace: "nowrap",
  },
  slotDay: {
    alignItems: "center",
    flexDirection: "column",
    justifyContent: "center",
  },
  slotHour: {
    alignItems: "center",
    paddingInline: "0.5rem",
  },
});

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
      {...stylex.props(styles.header)}
    >
      <div role="columnheader" aria-colindex={1} {...stylex.props(styles.corner)}>
        Resources
      </div>
      <div aria-hidden {...stylex.props(styles.groups)}>
        {groups.map((group) => (
          <div
            key={group.key}
            {...stylex.props(styles.group)}
            style={{
              insetInlineStart: `calc(var(--calendar-resource-column) + ${group.first * slotWidth}px)`,
              width: group.count * slotWidth,
            }}
          >
            <span {...stylex.props(styles.groupLabel)}>
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
            {...stylex.props(styles.slot, unit === "day" ? styles.slotDay : styles.slotHour)}
            style={{ insetInlineStart: item.start, width: item.size }}
          >
            {unit === "day" ? (
              <>
                <span {...stylex.props(styles.dayLabel)}>{labels.slot(slot)}</span>
                <span {...stylex.props(styles.dayNumber, isToday && styles.dayNumberToday)}>
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
