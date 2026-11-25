import type {
  CalendarCellFocus,
  EventId,
  NormalizedCalendarEvent,
  ResourceId,
  ResourceTimelineDayRow,
  ResourceTimelineHourRow,
  ResourceTimelineProjection,
  TimeGridColumn,
} from "@moltenship/calendar";
import type { VirtualItem } from "@tanstack/virtual-core";

import type { TimelineSlot, TimelineSlotUnit } from "./timeline-scale";

/**
 * The timeline's layout arithmetic, tied to its default markup: the sizes of its lanes, rows and
 * header, where bars, drafts and keyboard targets sit in a row, and where the time axis opens.
 * Every framework's timeline reads them from here.
 */

/** A lane's height, the gap under it, and the space above the first lane, in pixels. */
export const LANE_HEIGHT = 24;
export const LANE_GAP = 2;
export const ROW_PADDING = 6;
/** The shortest row, and the two-line header's height, in pixels. */
export const MIN_ROW_HEIGHT = 44;
export const HEADER_HEIGHT = 64;
/** The narrowest a slot gets before the timeline scrolls sideways. */
export const MIN_SLOT_WIDTH: Readonly<Record<TimelineSlotUnit, number>> = { day: 48, hour: 56 };
const HOURS = 24;
/** Without the current time in view, an hour timeline opens at 08:00. */
const DEFAULT_HOUR = 8;

/** Slots per date: the hours of an hour row, or one. */
export function slotsPerDay(unit: TimelineSlotUnit): number {
  return unit === "hour" ? HOURS : 1;
}

/**
 * A row tall enough for its lanes, or its stacks, and never shorter than an empty one. Whole
 * pixels, so the rows below a stack keep their lines on the pixel grid.
 */
export function rowHeight(row: ResourceTimelineProjection<unknown>["rows"][number]): number {
  const lanes = "height" in row ? row.height : row.laneCount;
  return Math.max(MIN_ROW_HEIGHT, Math.ceil(2 * ROW_PADDING + lanes * (LANE_HEIGHT + LANE_GAP)));
}

/**
 * Where an hour timeline opens: a third of the viewport before the current time, or before 08:00
 * when today isn't shown (`nowAt` is `null`), as a fraction of the range.
 */
export function openingOffset(
  nowAt: number | null,
  dates: number,
  slotCount: number,
  slotWidth: number,
  viewportWidth: number,
): number {
  const at = nowAt ?? DEFAULT_HOUR / (HOURS * dates);
  return Math.max(0, at * slotCount * slotWidth - viewportWidth / 3);
}

/** A bar's box in its cell, in pixels. */
export function barBox({ offset, top, width }: PlacedBar<unknown>) {
  return {
    height: LANE_HEIGHT,
    insetInlineStart: offset,
    top: ROW_PADDING + top * (LANE_HEIGHT + LANE_GAP),
    width,
  };
}

/** Where a cell of the keyboard sits along the slots, counting from the range's first slot. */
export function cellSlot(
  origin: Temporal.PlainDate | undefined,
  unit: TimelineSlotUnit,
  cell: CalendarCellFocus,
): number {
  return origin === undefined
    ? -1
    : origin.until(cell.date).days * slotsPerDay(unit) +
        (unit === "hour" && cell.kind === "slot" ? cell.time.hour : 0);
}

/**
 * The stretch a keyboard target covers, in slots: its snap step from its time in an hour row, or
 * its whole day.
 */
export function cellStretch(
  slot: number,
  unit: TimelineSlotUnit,
  cell: CalendarCellFocus,
  snapMinutes: number,
): readonly [from: number, to: number] {
  if (unit === "hour" && cell.kind === "slot") {
    const from = slot + cell.time.minute / 60;
    return [from, from + snapMinutes / 60];
  }
  return [slot, slot + slotsPerDay(unit)];
}

/** A keyboard target's box in its slot's cell, in pixels. */
export function cellTargetBox(
  unit: TimelineSlotUnit,
  cell: CalendarCellFocus,
  slotWidth: number,
  snapMinutes: number,
) {
  return unit === "hour" && cell.kind === "slot"
    ? {
        insetInlineStart: (cell.time.minute / 60) * slotWidth,
        width: (snapMinutes / 60) * slotWidth,
      }
    : { insetInlineStart: 0, width: slotsPerDay(unit) * slotWidth };
}

/** How many of a row's bars cover slot `index`. */
export function barsIn(bars: readonly TimelineBar<unknown>[], index: number): number {
  return bars.filter(({ end, start }) => start < index + 1 && end > index).length;
}

/**
 * The wall-clock strip of a date along an hour row, which sits in the first rendered cell of that
 * date, with its offset from that cell and its width; `undefined` in other cells.
 */
export function dateStrip(
  visibleSlots: readonly VirtualItem[],
  position: number,
  unit: TimelineSlotUnit,
  columns: readonly TimeGridColumn[],
  slotWidth: number,
):
  | { readonly column: TimeGridColumn; readonly offset: number; readonly width: number }
  | undefined {
  if (unit !== "hour") return undefined;
  const item = visibleSlots[position]!;
  const dateIndex = Math.floor(item.index / HOURS);
  const dateStart = dateIndex * HOURS;
  const previous = visibleSlots[position - 1];
  if (previous !== undefined && previous.index >= dateStart) return undefined;
  const column = columns[dateIndex];
  return column === undefined
    ? undefined
    : { column, offset: (dateStart - item.index) * slotWidth, width: HOURS * slotWidth };
}

/** A clock change's band along a date strip, as a share of the date. */
export function stripBand({ height, top }: { readonly height: number; readonly top: number }) {
  return { insetInlineStart: `${top * 100}%`, width: `${height * 100}%` };
}

/** A draft's box in the cell it starts in, in pixels. */
export function draftBox(draft: readonly [number, number], index: number, slotWidth: number) {
  return {
    insetInlineStart: (draft[0] - index) * slotWidth,
    width: (draft[1] - draft[0]) * slotWidth,
  };
}

/** The now line's box over the rows, in pixels. */
export function nowLineBox(
  nowAt: number,
  height: number,
  columnWidth: number,
  slotCount: number,
  slotWidth: number,
) {
  return {
    height: height - HEADER_HEIGHT,
    insetInlineStart: columnWidth + nowAt * slotCount * slotWidth,
    top: HEADER_HEIGHT,
  };
}

/** A group of the header's upper row, from its first slot, in pixels. */
export function slotGroupBox(first: number, count: number, slotWidth: number) {
  return {
    insetInlineStart: `calc(var(--calendar-resource-column) + ${first * slotWidth}px)`,
    width: count * slotWidth,
  };
}

/** An event's bar in a row, measured in slots from the start of the range. */
export interface TimelineBar<TEvent> {
  readonly end: number;
  readonly endsAfter: boolean;
  readonly event: NormalizedCalendarEvent<TEvent, EventId, ResourceId>;
  readonly lane: number;
  readonly start: number;
  readonly startsBefore: boolean;
  /** A timed event's start, shown when its bar fits in one day slot. */
  readonly time?: string;
  /** How far below the row's first lane the bar sits, in lanes: `lane`, or a fraction of it in a stack. */
  readonly top: number;
}

/** A bar placed in the first visible cell it covers. */
export interface PlacedBar<TEvent> extends TimelineBar<TEvent> {
  /** The first date the bar shows, and how many dates it covers. */
  readonly date: Temporal.PlainDate;
  readonly days: number;
  /** Where the bar starts relative to its cell, and its width, in pixels. */
  readonly offset: number;
  readonly width: number;
}

/** Space between a bar and the grid lines at the ends it doesn't continue past, in pixels. */
const INSET = 2;

/**
 * A row's bars in slots. Day rows come laid out like a month row, a slot per day; hour rows come
 * as fractions of the range, scaled here to its hour slots.
 */
export function rowBars<TEvent>(
  row: ResourceTimelineDayRow<TEvent> | ResourceTimelineHourRow<TEvent>,
  slotCount: number,
  formatTime: (instant: Temporal.Instant) => string,
): readonly TimelineBar<TEvent>[] {
  if ("segments" in row) {
    return row.segments.map(({ column, endsAfter, event, lane, span, startsBefore }) => ({
      end: column + span,
      endsAfter,
      event,
      lane,
      start: column,
      startsBefore,
      time:
        event.kind === "timed" && span === 1 && !startsBefore ? formatTime(event.start) : undefined,
      top: lane,
    }));
  }
  return row.bars.map(({ end, endsAfter, event, lane, start, startsBefore, top }) => ({
    end: end * slotCount,
    endsAfter,
    event,
    lane,
    start: start * slotCount,
    startsBefore,
    top,
  }));
}

/** The slots a stretch covers: the first, and the last it reaches into. */
export function slotsCovered(start: number, end: number): readonly [number, number] {
  const first = Math.floor(start);
  return [first, Math.max(first, Math.ceil(end) - 1)];
}

/** The first rendered slot in `from` to `to`, where an element covering them is placed. */
export function anchorSlot(
  visibleSlots: readonly VirtualItem[],
  from: number,
  to: number,
): number | undefined {
  return visibleSlots.find(({ index }) => from <= index && index <= to)?.index;
}

/**
 * The bars in view, each under the first rendered slot it covers: a bar that starts off-screen
 * still renders inside a cell of the grid, and reaches across the cells after it.
 */
export function placeBars<TEvent>(
  bars: readonly TimelineBar<TEvent>[],
  slots: readonly TimelineSlot[],
  visibleSlots: readonly VirtualItem[],
  slotWidth: number,
): ReadonlyMap<number, readonly PlacedBar<TEvent>[]> {
  const placed = new Map<number, PlacedBar<TEvent>[]>();
  for (const bar of bars) {
    const [from, to] = slotsCovered(bar.start, Math.min(bar.end, slots.length));
    const anchor = anchorSlot(visibleSlots, from, to);
    if (anchor === undefined) continue;
    const before = bar.startsBefore ? 0 : INSET;
    const after = bar.endsAfter ? 0 : INSET;
    const cell = placed.get(anchor) ?? [];
    cell.push({
      ...bar,
      date: slots[from]!.date,
      days: slots[from]!.date.until(slots[to]!.date).days + 1,
      offset: (bar.start - anchor) * slotWidth + before,
      width: Math.max(INSET, (bar.end - bar.start) * slotWidth - before - after),
    });
    placed.set(anchor, cell);
  }
  return placed;
}
