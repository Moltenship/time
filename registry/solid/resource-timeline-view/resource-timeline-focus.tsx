import {
  useCalendarInteraction,
  useResourceExpansion,
  useRovingFocus,
  type CalendarCellFocus,
  type ResourceId,
  type TimeGridColumn,
} from "@moltenship/calendar-solid";
import type { JSX } from "@solidjs/web";
import { untrack, type Accessor } from "solid-js";

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
  resourceId: Accessor<ResourceId | null>,
  columns: Accessor<readonly TimeGridColumn[]>,
  slotCount: Accessor<number>,
): Accessor<TimelineStretch | null> {
  return useCalendarInteraction(
    (session) => rowDraft(session, resourceId(), columns(), slotCount()),
    { isEqual: sameStretch },
  );
}

/**
 * The keyboard's cursor on a cell of this row, rendered only for the focused cell. Space starts a
 * create there and Enter moves into the events covering it.
 */
export function TimelineCellTarget(props: {
  readonly cell: CalendarCellFocus;
  readonly label: string;
  /** Listens on the target itself, before the view's keyboard, which listens on the grid. */
  readonly onKeyDown?: (event: KeyboardEvent) => void;
  readonly style: JSX.CSSProperties;
}) {
  const roving = useRovingFocus(() => props.cell);
  const keys = (element: HTMLElement) => {
    const onKeyDown = untrack(() => props.onKeyDown);
    if (onKeyDown !== undefined) element.addEventListener("keydown", onKeyDown);
  };

  return (
    <div
      role="button"
      aria-label={props.label}
      ref={[roving.ref, keys]}
      onFocus={roving.onFocus}
      tabindex={roving.tabindex}
      class={timelineCellTargetClass}
      style={props.style}
    />
  );
}

/**
 * The cursor on a cell of a group's row. The group's chevron stays out of the tab order, as the
 * grid keeps one tab stop, so Shift+Enter here expands or collapses the group, and the cell's name
 * says which it is.
 */
export function GroupCellTarget(props: {
  readonly cell: CalendarCellFocus;
  readonly groupId: ResourceId;
  readonly label: string;
  readonly style: JSX.CSSProperties;
  readonly title: string;
}) {
  const { expanded, toggle } = useResourceExpansion(() => props.groupId);

  return (
    <TimelineCellTarget
      cell={props.cell}
      label={groupCellTargetLabel(props.title, expanded(), props.label)}
      onKeyDown={(event) => {
        if (isGroupToggleKey(event)) {
          event.preventDefault();
          toggle(event);
        }
      }}
      style={props.style}
    />
  );
}
