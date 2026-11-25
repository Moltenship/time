"use client";

import {
  useCalendarInteraction,
  useResourceExpansion,
  useRovingFocus,
  type CalendarCellFocus,
  type ResourceId,
  type TimeGridColumn,
} from "@moltenship/calendar";
import type { CSSProperties, KeyboardEvent } from "react";

import { timelineCellTargetClass } from "@registry/shared/resource-timeline-view/resource-timeline.styles";
import {
  isGroupToggleKey,
  rowDraft,
  sameStretch,
  type TimelineStretch,
} from "@registry/shared/resource-timeline-view/timeline-focus";
import { groupCellTargetLabel } from "@registry/shared/resource-timeline-view/timeline-labels";

/** Where a keyboard create's draft falls in this row, in slots; `null` while there is none. */
export function useRowDraft(
  resourceId: ResourceId | null,
  columns: readonly TimeGridColumn[],
  slotCount: number,
): TimelineStretch | null {
  return useCalendarInteraction((session) => rowDraft(session, resourceId, columns, slotCount), {
    isEqual: sameStretch,
  });
}

/**
 * The keyboard's cursor on a cell of this row, rendered only for the focused cell. Space starts a
 * create there and Enter moves into the events covering it.
 */
export function TimelineCellTarget({
  cell,
  label,
  onKeyDown,
  style,
}: {
  readonly cell: CalendarCellFocus;
  readonly label: string;
  readonly onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
  readonly style: CSSProperties;
}) {
  const roving = useRovingFocus(cell);

  return (
    <div
      role="button"
      aria-label={label}
      {...roving}
      onKeyDown={onKeyDown}
      className={timelineCellTargetClass}
      style={style}
    />
  );
}

/**
 * The cursor on a cell of a group's row. The group's chevron stays out of the tab order, as the
 * grid keeps one tab stop, so Shift+Enter here expands or collapses the group, and the cell's name
 * says which it is.
 */
export function GroupCellTarget({
  groupId,
  label,
  title,
  ...props
}: {
  readonly cell: CalendarCellFocus;
  readonly groupId: ResourceId;
  readonly label: string;
  readonly style: CSSProperties;
  readonly title: string;
}) {
  const { expanded, toggle } = useResourceExpansion(groupId);

  return (
    <TimelineCellTarget
      {...props}
      label={groupCellTargetLabel(title, expanded, label)}
      onKeyDown={(event) => {
        if (isGroupToggleKey(event)) {
          event.preventDefault();
          toggle(event);
        }
      }}
    />
  );
}
