import type { EventId, ResourceId } from "@moltenship/calendar";
import { act } from "react";

import { toPlainDate } from "./environment";
import {
  CalendarQueryError,
  dayCell,
  eventElements,
  timeColumn,
  type CellQuery,
  type EventQuery,
} from "./queries";

/** A point in the viewport, in CSS pixels. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface PointerOptions {
  /** `"mouse"` by default. A touch holds still until its drag starts, as a long press does. */
  readonly pointerType?: "mouse" | "pen" | "touch";
  /** Moves between the press and the release. 4 by default. */
  readonly steps?: number;
  /** How long a touch waits for its drag to start, in milliseconds. 2000 by default. */
  readonly timeout?: number;
}

/** Thrown where pointer drivers need a layout the environment doesn't have, as in jsdom. */
export class PointerLayoutError extends Error {
  constructor(what: string) {
    super(
      `${what} has no size, so there's nowhere to point. jsdom and happy-dom don't lay pages out: run pointer tests in a browser, such as Vitest's browser mode, and use the keyboard driver elsewhere.`,
    );
    this.name = "PointerLayoutError";
  }
}

/**
 * Drives the pointer layer with Pointer Events at measured points, as a mouse, pen or finger
 * would. It needs a laid-out page; in jsdom and happy-dom every box is empty, so it throws a
 * `PointerLayoutError` there. What it drags to has to be on screen.
 */
export interface PointerDriver<TResourceId extends ResourceId = ResourceId> {
  /** Presses at `from`, moves to `to` and lets go. An element stands for its middle. */
  drag(from: Element | Point, to: Element | Point, options?: PointerOptions): Promise<void>;
  /**
   * Drags an event by its middle so it starts at `to`: its date, and in a time grid its time, in
   * its resource. Without `time`, it moves by whole days and keeps its time.
   */
  moveEvent(event: EventQuery, to: CellQuery<TResourceId>, options?: PointerOptions): Promise<void>;
  /** Drags an event's end (or start) handle to a time, or to a day in a month. */
  resizeEvent(
    event: EventQuery,
    to: CellQuery<TResourceId> & { readonly edge?: "end" | "start" },
    options?: PointerOptions,
  ): Promise<void>;
  /**
   * Drags across empty cells to create an event: from `from`'s slot to the end of `to`'s, or from
   * one day to another, both included.
   */
  createEvent(
    from: CellQuery<TResourceId>,
    to: CellQuery<TResourceId>,
    options?: PointerOptions,
  ): Promise<void>;
}

/** What the driver reads about an event. */
export interface PointerEventInfo {
  readonly id: EventId;
  readonly kind: "timed" | "all-day" | "floating";
  readonly start: Temporal.Instant | Temporal.PlainDate | Temporal.PlainDateTime;
  readonly end: Temporal.Instant | Temporal.PlainDate | Temporal.PlainDateTime;
}

interface PointerContext {
  readonly container: HTMLElement;
  readonly timeZone: () => string;
  readonly event: (query: EventQuery) => PointerEventInfo;
}

const midnight = (): Temporal.PlainTime => Temporal.PlainTime.from("00:00");

function boxOf(element: Element, what: string): DOMRect {
  const box = element.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0) throw new PointerLayoutError(what);
  return box;
}

function middle(box: DOMRect): Point {
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

function toPoint(target: Element | Point, what: string): Point {
  return "getBoundingClientRect" in target ? middle(boxOf(target, what)) : target;
}

/** How far through its day a wall time is: `0` at midnight, `1` at the next. */
function dayFraction(time: Temporal.PlainTime): number {
  return (time.hour * 60 + time.minute + time.second / 60) / (24 * 60);
}

function isInline(column: Element): boolean {
  return column.getAttribute("data-axis") === "inline";
}

function isRightToLeft(column: Element): boolean {
  return column.closest("[dir]")?.getAttribute("dir") === "rtl";
}

/** The point at `fraction` of a time column's day, across its middle. */
function alongColumn(column: HTMLElement, fraction: number): Point {
  const box = boxOf(column, "The time column");
  if (!isInline(column)) return { x: box.left + box.width / 2, y: box.top + fraction * box.height };
  const x = isRightToLeft(column)
    ? box.right - fraction * box.width
    : box.left + fraction * box.width;
  return { x, y: box.top + box.height / 2 };
}

/** How far through its day a point in a time column is. */
function fractionAt(column: HTMLElement, point: Point): number {
  const box = boxOf(column, "The time column");
  if (!isInline(column)) return (point.y - box.top) / box.height;
  return (isRightToLeft(column) ? box.right - point.x : point.x - box.left) / box.width;
}

function plus(point: Point, from: Point, to: Point): Point {
  return { x: point.x + to.x - from.x, y: point.y + to.y - from.y };
}

const nextFrame = () =>
  new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 16);
  });

export function createPointerDriver<TResourceId extends ResourceId>(
  context: PointerContext,
): PointerDriver<TResourceId> {
  const { container } = context;

  function send(target: Element, type: string, point: Point, pointerType: string) {
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        button: type === "pointermove" ? -1 : 0,
        buttons: type === "pointerup" ? 0 : 1,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        composed: true,
        isPrimary: true,
        pointerId: pointerType === "mouse" ? 1 : 2,
        pointerType,
      }),
    );
  }

  /** Waits until the region under `element` says a drag runs (`data-interaction`). */
  async function started(element: Element, timeout: number) {
    const deadline = performance.now() + timeout;
    while (element.closest("[data-interaction]") === null) {
      if (performance.now() > deadline) {
        throw new Error(`The long press didn't start a drag within ${timeout} ms.`);
      }
      await act(nextFrame);
    }
  }

  async function drag(from: Element | Point, to: Element | Point, options: PointerOptions = {}) {
    const { pointerType = "mouse", steps = 4, timeout = 2000 } = options;
    const start = toPoint(from, "The element to drag from");
    const end = toPoint(to, "The element to drag to");
    const target =
      document.elementFromPoint(start.x, start.y) ??
      ("getBoundingClientRect" in from ? from : container);
    await act(async () => send(target, "pointerdown", start, pointerType));
    if (pointerType === "touch") await started(target, timeout);
    for (let index = 1; index <= steps; index += 1) {
      const point = {
        x: start.x + ((end.x - start.x) * index) / steps,
        y: start.y + ((end.y - start.y) * index) / steps,
      };
      await act(async () => send(target, "pointermove", point, pointerType));
      await act(nextFrame);
    }
    await act(async () => send(target, "pointerup", end, pointerType));
  }

  /** The event's first element, scrolled into view. */
  function shown(id: EventId): HTMLElement {
    const element = eventElements(container, id)[0];
    if (element === undefined) {
      throw new CalendarQueryError(`The view shows no element for event ${String(id)}.`);
    }
    boxOf(element, "The event");
    element.scrollIntoView({ block: "nearest", inline: "nearest" });
    return element;
  }

  function columnFor(cell: CellQuery<TResourceId>): HTMLElement {
    const found = timeColumn(container, cell.date, cell.resourceId);
    if (found === null) {
      throw new CalendarQueryError(
        `The view shows no time column for ${toPlainDate(cell.date).toString()}.`,
      );
    }
    return found;
  }

  function dayFor(cell: CellQuery<TResourceId>): HTMLElement {
    const found = dayCell(container, cell.date, cell.resourceId);
    if (found === null) {
      throw new CalendarQueryError(
        `The view shows no day cell for ${toPlainDate(cell.date).toString()}.`,
      );
    }
    return found;
  }

  /** The `data-date` cell under a point, beneath anything inside `inside`. */
  function cellAt(point: Point, inside: Element): HTMLElement {
    const cell = document
      .elementsFromPoint(point.x, point.y)
      .find(
        (element): element is HTMLElement =>
          element instanceof HTMLElement &&
          element.hasAttribute("data-date") &&
          !inside.contains(element),
      );
    if (cell === undefined) throw new CalendarQueryError("No day or time cell is under the point.");
    return cell;
  }

  function wallTime(value: PointerEventInfo["start"]): Temporal.PlainTime {
    if (typeof value === "object" && "epochNanoseconds" in value && !("calendarId" in value)) {
      return (value as Temporal.Instant).toZonedDateTimeISO(context.timeZone()).toPlainTime();
    }
    return "hour" in value ? (value as Temporal.PlainDateTime).toPlainTime() : midnight();
  }

  function dateOf(value: PointerEventInfo["start"]): Temporal.PlainDate {
    if (typeof value === "object" && "epochNanoseconds" in value && !("calendarId" in value)) {
      return (value as Temporal.Instant).toZonedDateTimeISO(context.timeZone()).toPlainDate();
    }
    return Temporal.PlainDate.from(value as Temporal.PlainDate);
  }

  /** Where a press at `grab` in `from` lands to move a date by `days`, in `to`'s cell. */
  function dayTarget(grab: Point, from: HTMLElement, cell: CellQuery<TResourceId>): Point {
    return plus(
      grab,
      middle(boxOf(from, "The day under the press")),
      middle(boxOf(dayFor(cell), "The target day")),
    );
  }

  return Object.freeze({
    async createEvent(
      from: CellQuery<TResourceId>,
      to: CellQuery<TResourceId>,
      options?: PointerOptions,
    ) {
      if (from.time === undefined || to.time === undefined) {
        await drag(dayFor(from), dayFor(to), options);
        return;
      }
      // A minute into the first and the last slot: a create covers each slot it touches.
      const nudge = 1 / (24 * 60);
      const start = alongColumn(
        columnFor(from),
        dayFraction(Temporal.PlainTime.from(from.time)) + nudge,
      );
      const end = alongColumn(columnFor(to), dayFraction(Temporal.PlainTime.from(to.time)) + nudge);
      await drag(start, end, options);
    },
    drag,
    async moveEvent(query: EventQuery, to: CellQuery<TResourceId>, options?: PointerOptions) {
      const event = context.event(query);
      const element = shown(event.id);
      const grab = middle(boxOf(element, "The event"));
      const from = cellAt(grab, element);
      if (to.time === undefined) {
        // Whole days: the day under the press moves as far as the start does.
        const pressed = toPlainDate(from.getAttribute("data-date")!);
        const days = dateOf(event.start).until(toPlainDate(to.date)).days;
        await drag(grab, dayTarget(grab, from, { ...to, date: pressed.add({ days }) }), options);
        return;
      }
      // Keep the press's offset from the start, so the start lands on the time.
      const offset = fractionAt(from, grab) - dayFraction(wallTime(event.start));
      const target = alongColumn(
        columnFor(to),
        dayFraction(Temporal.PlainTime.from(to.time)) + offset,
      );
      await drag(grab, target, options);
    },
    async resizeEvent(
      query: EventQuery,
      to: CellQuery<TResourceId> & { readonly edge?: "end" | "start" },
      options?: PointerOptions,
    ) {
      const { edge = "end" } = to;
      const event = context.event(query);
      const element = shown(event.id);
      const handle = element.querySelector(`[data-resize="${edge}"]`);
      if (handle === null) {
        throw new CalendarQueryError(
          `The event has no ${edge} handle: is the calendar read-only, or the view one without resizing?`,
        );
      }
      const grab = middle(boxOf(handle, "The resize handle"));
      const from = cellAt(grab, element);
      if (to.time === undefined) {
        // Whole days: the day under the handle moves as far as the edge does.
        const edgeDate =
          edge === "end" && event.kind === "all-day"
            ? dateOf(event.end).subtract({ days: 1 })
            : dateOf(edge === "end" ? event.end : event.start);
        const pressed = toPlainDate(from.getAttribute("data-date")!);
        const days = edgeDate.until(toPlainDate(to.date)).days;
        await drag(grab, dayTarget(grab, from, { ...to, date: pressed.add({ days }) }), options);
        return;
      }
      // Keep the press's offset from the edge, so the edge lands on the time. An end at midnight
      // is the bottom of the day before.
      const time = wallTime(edge === "end" ? event.end : event.start);
      const edgeFraction = edge === "end" && time.equals(midnight()) ? 1 : dayFraction(time);
      const offset = fractionAt(from, grab) - edgeFraction;
      const target = alongColumn(
        columnFor(to),
        dayFraction(Temporal.PlainTime.from(to.time)) + offset,
      );
      await drag(grab, target, options);
    },
  });
}
