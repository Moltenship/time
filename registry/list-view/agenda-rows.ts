import {
  plainDateInterval,
  type EventId,
  type ListDay,
  type PlainDateInterval,
  type ResourceId,
} from "@moltenship/calendar";

export type AgendaDay<TEvent> = ListDay<TEvent, EventId, ResourceId>;

/**
 * A row of the agenda's virtual list: a day with its events, or, in a scrolling agenda, the end of
 * the list, which says nothing more is scheduled in the loaded dates after the last day and leaves
 * room to scroll any day to the top.
 */
export type AgendaRow<TEvent> =
  | { readonly day: AgendaDay<TEvent>; readonly key: string; readonly kind: "day" }
  | {
      /** The loaded dates after the last day, which have no events; `null` when there are none. */
      readonly empty: PlainDateInterval | null;
      /** The first date after the last day: where the list is when the end row is on top. */
      readonly from: Temporal.PlainDate;
      readonly key: string;
      readonly kind: "end";
    };

/** Estimated heights, in pixels, until a row is measured. */
const DAY_PADDING = 17;
const DATE_COLUMN = 60;
const ITEM = 34;

/** A row per day; with `loaded`, the dates projected, then the end row after them. */
export function agendaRows<TEvent>(
  days: readonly AgendaDay<TEvent>[],
  loaded?: PlainDateInterval,
): readonly AgendaRow<TEvent>[] {
  const rows = days.map((day) => ({ day, key: day.date.toString(), kind: "day" as const }));
  if (loaded === undefined) return rows;
  const from = days.at(-1)?.date.add({ days: 1 }) ?? loaded.start;
  const empty =
    Temporal.PlainDate.compare(from, loaded.end) < 0 ? plainDateInterval(from, loaded.end) : null;
  return [...rows, { empty, from, key: "end", kind: "end" }];
}

/** The first row on or after `date`: its day, a later one, or the end row; else past the rows. */
export function rowFrom(rows: readonly AgendaRow<unknown>[], date: Temporal.PlainDate): number {
  const index = rows.findIndex(
    (row) => row.kind === "end" || Temporal.PlainDate.compare(row.day.date, date) >= 0,
  );
  return index === -1 ? rows.length : index;
}

/** The date a row lists, which the anchor moves to when the row is on top. */
export function rowDate(row: AgendaRow<unknown>): Temporal.PlainDate {
  return row.kind === "day" ? row.day.date : row.from;
}

/** A row's height before it is measured; the end row fills the viewport. */
export function estimateRowHeight(row: AgendaRow<unknown>, viewportHeight: number): number {
  return row.kind === "end"
    ? viewportHeight
    : DAY_PADDING + Math.max(DATE_COLUMN, 8 + row.day.items.length * ITEM);
}
