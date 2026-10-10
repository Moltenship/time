import {
  sameFocus,
  useResourceExpansion,
  timelineExtent,
  useCalendarFocus,
  useCalendarInteraction,
  useRovingFocus,
  type CalendarCellFocus,
  type ResourceId,
  type TimeGridColumn,
} from "@moltenship/calendar";
import type { CSSProperties, KeyboardEvent } from "react";

/**
 * The cell keyboard focus is on in this row. While nothing has focus, the first row also holds
 * the view's entry, so tabbing in has somewhere to land.
 */
export function useRowCell(
  resourceId: ResourceId | null,
  entry: CalendarCellFocus | null,
): CalendarCellFocus | null {
  return useCalendarFocus(
    (focus) =>
      focus === null
        ? entry
        : focus.kind !== "event" && focus.resourceId === resourceId
          ? focus
          : null,
    { isEqual: sameFocus },
  );
}

type Stretch = readonly [start: number, end: number];

const sameStretch = (left: Stretch | null, right: Stretch | null) =>
  left === right || (left?.[0] === right?.[0] && left?.[1] === right?.[1]);

/** Where a keyboard create's draft falls in this row, in slots; `null` while there is none. */
export function useRowDraft(
  resourceId: ResourceId | null,
  columns: readonly TimeGridColumn[],
  slotCount: number,
): Stretch | null {
  return useCalendarInteraction(
    (session) => {
      if (session === null || session.eventId !== null) return null;
      if (session.cursor.resourceId !== resourceId) return null;
      const extent = timelineExtent(columns, session.proposed);
      return extent === null ? null : [extent.start * slotCount, extent.end * slotCount];
    },
    { isEqual: sameStretch },
  );
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
      className="pointer-events-none absolute inset-y-0 z-10 rounded-sm focus-visible:bg-calendar-selection focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
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
      label={`${title}, ${expanded ? "expanded" : "collapsed"}, ${label}`}
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.shiftKey) {
          event.preventDefault();
          toggle();
        }
      }}
    />
  );
}
