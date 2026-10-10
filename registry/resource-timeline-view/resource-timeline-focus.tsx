import {
  sameFocus,
  timelineExtent,
  useCalendarInteraction,
  useResourceExpansion,
  useRovingFocus,
  type CalendarCellFocus,
  type CalendarFocus,
  type EventId,
  type PlainDateInterval,
  type ResourceId,
  type ResourceTimelineProjection,
  type TimeGridColumn,
} from "@moltenship/calendar";
import type { CSSProperties, KeyboardEvent } from "react";

const HOURS = 24;

export interface CellTargets {
  /** The cells each row renders a keyboard target for, by row index. */
  readonly cells: ReadonlyMap<number, readonly CalendarCellFocus[]>;
  /** Rows and slots that render even when scrolled away, so the targets and a focused event do. */
  readonly rows: readonly number[];
  readonly slots: readonly number[];
}

/**
 * Where keyboard focus can land. The first row always holds the view's entry, where the calendar
 * enters it, which is the tab stop until something has focus or when the focus can't show here.
 * The focused cell sits in its row; focus from a view without resources names none and sits in
 * the first row, as navigation moves it from there. A time grid's slot covers its whole day in a
 * timeline of days, keeping its kind until the view's request to make it a day is accepted, so it
 * stays the tab stop while the owner holds it. These, and a focused event's element, stay
 * rendered while scrolled away.
 */
export function cellTargets<TEvent>(
  focus: CalendarFocus | null,
  entry: CalendarCellFocus | null,
  { columns, rows, unit }: ResourceTimelineProjection<TEvent>,
  range: PlainDateInterval,
): CellTargets {
  if (entry === null) return { cells: new Map(), rows: [], slots: [] };
  const perDay = unit === "hour" ? HOURS : 1;
  const slotCount = columns.length * perDay;
  const dayOf = (date: Temporal.PlainDate) => range.start.until(date).days;
  // A slot from a time grid sits on its whole day in a timeline of days.
  const slotOf = (cell: CalendarCellFocus) =>
    dayOf(cell.date) * perDay + (unit === "hour" && cell.kind === "slot" ? cell.time.hour : 0);

  const cells = new Map<number, CalendarCellFocus[]>([[0, [entry]]]);
  const pinned = { rows: [0], slots: [slotOf(entry)] };
  if (focus === null) return { cells, ...pinned };

  const day = dayOf(focus.date);
  const rowOf = (eventId?: EventId) =>
    focus.resourceId !== undefined
      ? rows.findIndex(({ resource }) => resource.id === focus.resourceId)
      : eventId === undefined
        ? 0
        : rows.findIndex((row) => eventStart(row, eventId, day, slotCount) !== undefined);

  if (focus.kind !== "event") {
    const row = day >= 0 && day < columns.length ? rowOf() : -1;
    if (row !== -1) {
      // Named after its row, a resource-less focus can't also match the entry beside it.
      const cell = { ...focus, resourceId: rows[row]!.resource.id };
      const targets = cells.get(row) ?? [];
      if (!targets.some((target) => sameFocus(target, cell))) cells.set(row, [...targets, cell]);
      pinned.rows.push(row);
      pinned.slots.push(slotOf(cell));
    }
  } else {
    const row = rowOf(focus.eventId);
    const slot = row === -1 ? undefined : eventStart(rows[row]!, focus.eventId, day, slotCount);
    if (slot !== undefined) {
      pinned.rows.push(row);
      pinned.slots.push(slot);
    }
  }
  return { cells, ...pinned };
}

/**
 * The slot an event's element starts in within a row; `undefined` when the row doesn't show it.
 * Over days, an event around a date the wall clock skips shows in pieces: the one holding `day`.
 */
function eventStart<TEvent>(
  row: ResourceTimelineProjection<TEvent>["rows"][number],
  eventId: EventId,
  day: number,
  slotCount: number,
): number | undefined {
  if ("segments" in row) {
    const pieces = row.segments.filter(({ event }) => event.id === eventId);
    const piece = pieces.find(({ column, span }) => column <= day && day < column + span);
    return (piece ?? pieces[0])?.column;
  }
  const bar = row.bars.find(({ event }) => event.id === eventId);
  return bar === undefined ? undefined : Math.min(slotCount - 1, Math.floor(bar.start * slotCount));
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
