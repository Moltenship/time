import {
  plainDateInterval,
  type EventId,
  type ListDay,
  type PlainDateInterval,
  type ResourceId,
} from "@moltenship/calendar";

export type AgendaDay<TEvent> = ListDay<TEvent, EventId, ResourceId>;

/**
 * A row of the agenda's virtual list: a day with its events. A scrolling agenda also has the end
 * of the list, which leaves room to scroll any row to the top and says nothing more is scheduled
 * after the last row. When the dates shown have no events, the end row stands in for them, or, with
 * days after them, an empty row does, where they fall among the days.
 */
export type AgendaRow<TEvent> =
  | { readonly day: AgendaDay<TEvent>; readonly key: string; readonly kind: "day" }
  | { readonly key: string; readonly kind: "empty"; readonly range: PlainDateInterval }
  | {
      /** The loaded dates after the last row, which have no events; `null` when there are none. */
      readonly empty: PlainDateInterval | null;
      /** The first date after the last row: where the list is when the end row is on top. */
      readonly from: Temporal.PlainDate;
      readonly key: string;
      readonly kind: "end";
      /** Whether it stands in for the dates shown, which have no events and no days after. */
      readonly shown: boolean;
    };

/** Estimated heights, in pixels, until a row is measured. */
const DAY_PADDING = 17;
const DATE_COLUMN = 60;
const EMPTY = 220;
const ITEM = 34;

const compare = (left: Temporal.PlainDate, right: Temporal.PlainDate) =>
  Temporal.PlainDate.compare(left, right);

/**
 * A row per day. A scrolling agenda passes the dates it shows and those it has loaded, and gets the
 * end row after the last row; when the dates shown have no events, the end row stands in for them,
 * or, when days come after them, an empty row does, where they fall among the days.
 */
export function agendaRows<TEvent>(
  days: readonly AgendaDay<TEvent>[],
  scrolling?: { readonly loaded: PlainDateInterval; readonly shown: PlainDateInterval },
): readonly AgendaRow<TEvent>[] {
  const rows: AgendaRow<TEvent>[] = days.map((day) => ({
    day,
    key: day.date.toString(),
    kind: "day",
  }));
  if (scrolling === undefined) return rows;
  const { loaded, shown } = scrolling;
  const after = days.findIndex(({ date }) => compare(date, shown.start) >= 0);
  const emptyShown = after === -1 || compare(days[after]!.date, shown.end) >= 0;
  if (emptyShown && after !== -1) {
    rows.splice(after, 0, { key: "empty", kind: "empty", range: shown });
  }
  const standsIn = emptyShown && after === -1;
  const from = standsIn ? shown.start : (days.at(-1)?.date.add({ days: 1 }) ?? loaded.start);
  const empty = compare(from, loaded.end) < 0 ? plainDateInterval(from, loaded.end) : null;
  return [...rows, { empty, from, key: "end", kind: "end", shown: standsIn }];
}

/**
 * The first row on or after `date`: its day, a later one, the empty row for the dates shown when
 * they include it, or the end row; else past the rows.
 */
export function rowFrom(rows: readonly AgendaRow<unknown>[], date: Temporal.PlainDate): number {
  const index = rows.findIndex((row) =>
    row.kind === "day"
      ? compare(row.day.date, date) >= 0
      : row.kind === "empty"
        ? compare(row.range.end, date) > 0
        : true,
  );
  return index === -1 ? rows.length : index;
}

/**
 * What a row shows on screen, kept on top as rows change: its key, except for the end row standing
 * in for the dates shown, which is their empty state, as the empty row is once days come after.
 */
export function placeKey(row: AgendaRow<unknown>): string {
  return row.kind === "end" && row.shown ? "empty" : row.key;
}

/** The date a row lists, which the anchor moves to when the row is on top. */
export function rowDate(row: AgendaRow<unknown>): Temporal.PlainDate {
  return row.kind === "day" ? row.day.date : row.kind === "empty" ? row.range.start : row.from;
}

/** A row's height before it is measured; the end row fills the viewport. */
export function estimateRowHeight(row: AgendaRow<unknown>, viewportHeight: number): number {
  if (row.kind === "end") return viewportHeight;
  if (row.kind === "empty") return EMPTY;
  return DAY_PADDING + Math.max(DATE_COLUMN, 8 + row.day.items.length * ITEM);
}
