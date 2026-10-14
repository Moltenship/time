import { resourceIdOf, type EventId, type ResourceId } from "@moltenship/calendar";
import { act } from "react";

import { realNow } from "./real-time";
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
 * would. It needs a laid-out page and real timers; in jsdom and happy-dom every box is empty, so
 * it throws a `PointerLayoutError` there. Where it presses and lets go has to be on screen.
 */
export interface PointerDriver<
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
> {
  /** Presses at `from`, moves to `to` and lets go. An element stands for its middle. */
  drag(from: Element | Point, to: Element | Point, options?: PointerOptions): Promise<void>;
  /**
   * Drags an event by its middle so it starts on `to`'s date, at `time` in a time column, in
   * `to`'s resource or the one it's pressed in. Without `time`, it moves by whole days and keeps
   * its time.
   */
  moveEvent(
    event: EventQuery<TEventId>,
    to: CellQuery<TResourceId>,
    options?: PointerOptions,
  ): Promise<void>;
  /**
   * Drags an event's end (or start) handle so that edge lands at `time`, or, in a view that
   * resizes by days, as a timeline over days does, on `date`.
   */
  resizeEvent(
    event: EventQuery<TEventId>,
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
interface PointerEventInfo<TEventId extends EventId> {
  readonly id: TEventId;
  readonly kind: "timed" | "all-day" | "floating";
  readonly start: Temporal.Instant | Temporal.PlainDate | Temporal.PlainDateTime;
  readonly end: Temporal.Instant | Temporal.PlainDate | Temporal.PlainDateTime;
}

interface PointerContext<TEventId extends EventId> {
  readonly container: HTMLElement;
  readonly timeZone: () => string;
  readonly event: (query: EventQuery<TEventId>) => PointerEventInfo<TEventId>;
}

const minute = 1 / (24 * 60);

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

export function createPointerDriver<TEventId extends EventId, TResourceId extends ResourceId>(
  context: PointerContext<TEventId>,
): PointerDriver<TEventId, TResourceId> {
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
    const deadline = realNow() + timeout;
    while (element.closest("[data-interaction]") === null) {
      if (realNow() > deadline) {
        throw new Error(`The long press didn't start a drag within ${timeout} ms.`);
      }
      await act(nextFrame);
    }
  }

  /**
   * Presses at `from`, moves toward `to` in steps and lets go there. `to` is measured again after
   * each frame, so a view that scrolls under the pointer, as auto-scroll at an edge does, still
   * gets the release where `to` is then.
   */
  async function dragTo(from: Point, to: () => Point, pressed: Element, options: PointerOptions) {
    const { pointerType = "mouse", steps = 4, timeout = 2000 } = options;
    const target = document.elementFromPoint(from.x, from.y) ?? pressed;
    await act(async () => send(target, "pointerdown", from, pointerType));
    if (pointerType === "touch") await started(target, timeout);
    let point = from;
    for (let index = 1; index <= steps; index += 1) {
      const end = to();
      point = {
        x: from.x + ((end.x - from.x) * index) / steps,
        y: from.y + ((end.y - from.y) * index) / steps,
      };
      await act(async () => send(target, "pointermove", point, pointerType));
      await act(nextFrame);
    }
    // Follow the target until it holds still, a few frames at most.
    for (let index = 0; index < 5; index += 1) {
      const end = to();
      if (Math.abs(end.x - point.x) < 0.5 && Math.abs(end.y - point.y) < 0.5) break;
      point = end;
      await act(async () => send(target, "pointermove", point, pointerType));
      await act(nextFrame);
    }
    await act(async () => send(target, "pointerup", point, pointerType));
  }

  async function drag(from: Element | Point, to: Element | Point, options: PointerOptions = {}) {
    const start = toPoint(from, "The element to drag from");
    toPoint(to, "The element to drag to");
    await dragTo(
      start,
      () => toPoint(to, "The element to drag to"),
      "getBoundingClientRect" in from ? from : container,
      options,
    );
  }

  function shown(id: TEventId): HTMLElement[] {
    const elements = eventElements(container, id);
    if (elements.length === 0) {
      throw new CalendarQueryError(`The view shows no element for event ${JSON.stringify(id)}.`);
    }
    return elements;
  }

  /** Scrolls `element` into view and returns its middle, which must be on top there. */
  function pressPoint(element: HTMLElement, what: string): Point {
    boxOf(element, what);
    element.scrollIntoView({ block: "nearest", inline: "nearest" });
    const point = middle(boxOf(element, what));
    const hit = document.elementFromPoint(point.x, point.y);
    if (hit === null || !element.contains(hit)) {
      throw new CalendarQueryError(
        `${what}'s middle is covered or off screen${hit === null ? "" : ` (by ${hit.tagName.toLowerCase()})`}: make the calendar taller, or scroll it first.`,
      );
    }
    return point;
  }

  /** Checks a drop point lands on `cell`, as the pointer layer's hit test would find it. */
  function assertLands(point: Point, cell: HTMLElement, what: string) {
    for (const element of document.elementsFromPoint(point.x, point.y)) {
      if (element.closest("[data-occludes]") !== null) break;
      const found = element.closest("[data-date]");
      if (found === null) continue;
      if (found === cell) return;
      break;
    }
    throw new CalendarQueryError(
      `The drop point for ${what} is off screen or covered: make the calendar taller, or scroll it there first.`,
    );
  }

  function columnFor(cell: CellQuery<TResourceId>, date = toPlainDate(cell.date)): HTMLElement {
    const found = timeColumn(container, date, cell.resourceId);
    if (found === null) {
      throw new CalendarQueryError(`The view shows no time column for ${date.toString()}.`);
    }
    return found;
  }

  function dayFor(cell: CellQuery<TResourceId>, date = toPlainDate(cell.date)): HTMLElement {
    const found = dayCell(container, date, cell.resourceId);
    if (found === null) {
      throw new CalendarQueryError(`The view shows no day cell for ${date.toString()}.`);
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
    if (cell === undefined) throw new CalendarQueryError("No day or time cell is under the press.");
    return cell;
  }

  /**
   * Whether a cell runs through a day's hours: a timeline's strip, or a time grid's column,
   * which holds its events, while a month's day and an all-day cell sit beside theirs.
   */
  function isTimeColumn(cell: HTMLElement, event: HTMLElement): boolean {
    return !cell.hasAttribute("data-all-day") && (isInline(cell) || cell.contains(event));
  }

  function dateOf(value: PointerEventInfo<TEventId>["start"]): Temporal.PlainDate {
    if (value instanceof Temporal.Instant) {
      return value.toZonedDateTimeISO(context.timeZone()).toPlainDate();
    }
    return Temporal.PlainDate.from(value);
  }

  function wallTime(value: PointerEventInfo<TEventId>["start"]): Temporal.PlainTime {
    if (value instanceof Temporal.Instant) {
      return value.toZonedDateTimeISO(context.timeZone()).toPlainTime();
    }
    return value instanceof Temporal.PlainDateTime
      ? value.toPlainTime()
      : Temporal.PlainTime.from("00:00");
  }

  /** The point `total` days into `to`'s date, a fraction carrying the time, in its time column. */
  function inColumn(
    to: CellQuery<TResourceId>,
    total: number,
  ): { readonly point: () => Point; readonly column: HTMLElement } {
    const days = Math.floor(total);
    const column = columnFor(to, toPlainDate(to.date).add({ days }));
    return { column, point: () => alongColumn(column, total - days) };
  }

  /**
   * Where a press in day cell `from` lands in the cell for `date`, in `to`'s resource: as far
   * into that cell as the press is into `from`.
   */
  function onDay(
    grab: Point,
    from: HTMLElement,
    to: CellQuery<TResourceId>,
    date: Temporal.PlainDate,
  ): { readonly point: () => Point; readonly cell: HTMLElement } {
    const cell = dayFor(to, date);
    const fromMiddle = middle(boxOf(from, "The day under the press"));
    return { cell, point: () => plus(grab, fromMiddle, middle(boxOf(cell, "The target day"))) };
  }

  /** `to` in the resource the press is in, unless it names one. */
  function inPressedResource(
    to: CellQuery<TResourceId>,
    from: HTMLElement,
  ): CellQuery<TResourceId> {
    if (to.resourceId !== undefined) return to;
    const resourceId = resourceIdOf(from);
    return resourceId === undefined ? to : { ...to, resourceId: resourceId as TResourceId | null };
  }

  /** Checks the drop lands where it should, then drags there from `grab`. */
  async function dropAt(
    grab: Point,
    target: {
      readonly point: () => Point;
      readonly cell?: HTMLElement;
      readonly column?: HTMLElement;
    },
    pressed: Element,
    what: string,
    options: PointerOptions = {},
  ) {
    assertLands(target.point(), (target.cell ?? target.column)!, what);
    await dragTo(grab, target.point, pressed, options);
  }

  return Object.freeze({
    async createEvent(
      from: CellQuery<TResourceId>,
      to: CellQuery<TResourceId>,
      options?: PointerOptions,
    ) {
      if (from.time === undefined || to.time === undefined) {
        const first = dayFor(from);
        const last = dayFor(to);
        const start = middle(boxOf(first, "The first day"));
        assertLands(start, first, "the create's start");
        await dropAt(
          start,
          { cell: last, point: () => middle(boxOf(last, "The last day")) },
          first,
          "the create's end",
          options,
        );
        return;
      }
      // A minute into the first and the last slot: a create covers each slot it touches.
      const firstColumn = columnFor(from);
      const lastColumn = columnFor(to);
      const start = alongColumn(
        firstColumn,
        dayFraction(Temporal.PlainTime.from(from.time)) + minute,
      );
      const end = dayFraction(Temporal.PlainTime.from(to.time)) + minute;
      assertLands(start, firstColumn, "the create's start");
      await dropAt(
        start,
        { column: lastColumn, point: () => alongColumn(lastColumn, end) },
        firstColumn,
        "the create's end",
        options,
      );
    },
    drag,
    async moveEvent(
      query: EventQuery<TEventId>,
      target: CellQuery<TResourceId>,
      options?: PointerOptions,
    ) {
      const event = context.event(query);
      const element = shown(event.id)[0]!;
      const grab = pressPoint(element, "The event");
      const from = cellAt(grab, element);
      const to = inPressedResource(target, from);
      const pressed = toPlainDate(from.getAttribute("data-date")!);
      const daysIn = dateOf(event.start).until(pressed).days;

      if (isTimeColumn(from, element)) {
        // How far into the event the press is, in days: the drop keeps it.
        const into = daysIn + fractionAt(from, grab) - dayFraction(wallTime(event.start));
        const at =
          to.time === undefined
            ? dayFraction(wallTime(event.start))
            : dayFraction(Temporal.PlainTime.from(to.time));
        await dropAt(grab, inColumn(to, at + into), element, "the event", options);
        return;
      }
      if (to.time !== undefined) {
        // From a day to a time: the event takes the slot it's dropped in.
        const column = columnFor(to);
        const at = dayFraction(Temporal.PlainTime.from(to.time)) + minute / 2;
        await dropAt(
          grab,
          { column, point: () => alongColumn(column, at) },
          element,
          "the event",
          options,
        );
        return;
      }
      // Whole days: the day under the press moves as far as the start does.
      const date = toPlainDate(to.date).add({ days: daysIn });
      await dropAt(grab, onDay(grab, from, to, date), element, "the event", options);
    },
    async resizeEvent(
      query: EventQuery<TEventId>,
      target: CellQuery<TResourceId> & { readonly edge?: "end" | "start" },
      options?: PointerOptions,
    ) {
      const { edge = "end" } = target;
      const event = context.event(query);
      const elements = shown(event.id);
      // A fragment draws an edge's handle only where the event's edge is.
      const handles = elements.flatMap((element) => [
        ...element.querySelectorAll<HTMLElement>(`[data-resize="${edge}"]`),
      ]);
      const handle = edge === "end" ? handles.at(-1) : handles[0];
      if (handle === undefined) {
        throw new CalendarQueryError(
          `The event has no ${edge} handle: is the calendar read-only, or does the view not resize this event?`,
        );
      }
      const element = elements.find((candidate) => candidate.contains(handle))!;
      const grab = pressPoint(handle, "The resize handle");
      const from = cellAt(grab, element);
      const to = inPressedResource(target, from);
      const pressed = toPlainDate(from.getAttribute("data-date")!);
      const edgeValue = edge === "end" ? event.end : event.start;

      if (isTimeColumn(from, element) && to.time !== undefined) {
        // How far the press is from the edge, in days: the drop keeps it.
        const into =
          dateOf(edgeValue).until(pressed).days +
          fractionAt(from, grab) -
          dayFraction(wallTime(edgeValue));
        const total = dayFraction(Temporal.PlainTime.from(to.time)) + into;
        await dropAt(grab, inColumn(to, total), handle, "the edge", options);
        return;
      }
      // Whole days: the day under the handle moves as far as the edge does.
      const edgeDay =
        edge === "end" && event.kind === "all-day"
          ? dateOf(edgeValue).subtract({ days: 1 })
          : dateOf(edgeValue);
      const days = edgeDay.until(toPlainDate(to.date)).days;
      await dropAt(grab, onDay(grab, from, to, pressed.add({ days })), handle, "the edge", options);
    },
  });
}
