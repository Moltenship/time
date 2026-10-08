import {
  belongsInTimeGridAllDayRow,
  splitEventsByDay,
  timedFragmentBox,
  type CalendarEventPlacement,
  type NormalizedCalendarEvent,
  type ResourceId,
} from "@moltenship/calendar-core";
import {
  comparePlainDates,
  instantInterval,
  plainDateInterval,
} from "@moltenship/calendar-temporal";

import { dayCells, timeColumns, type TargetSurface } from "./targets";

interface Bounds {
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
}

export interface GhostRect {
  readonly height: number;
  readonly left: number;
  readonly top: number;
  /** Where the segment may paint: its cell's scroll viewport and other clipping ancestors. */
  readonly visible: Bounds;
  readonly width: number;
}

/** Viewport rectangles read at most once per layout. */
type RectReader = (element: Element) => DOMRect;

function clips(overflow: string): boolean {
  return overflow !== "" && overflow !== "visible";
}

/**
 * The part of the viewport where a cell's content can paint. The preview is fixed-position, so it
 * applies the clipping of the cell's scroll viewport and other overflow ancestors itself.
 */
function visibleBounds(surface: TargetSurface, cell: Element, rectOf: RectReader): Bounds {
  let ancestors = surface.clippers.get(cell);
  if (ancestors === undefined) {
    const found: Element[] = [];
    for (let current = cell.parentElement; current !== null; current = current.parentElement) {
      const { overflowX, overflowY } = getComputedStyle(current);
      if (clips(overflowX) || clips(overflowY)) found.push(current);
    }
    surface.clippers.set(cell, found);
    ancestors = found;
  }

  let bounds: Bounds = { bottom: innerHeight, left: 0, right: innerWidth, top: 0 };
  for (const ancestor of ancestors) {
    const rect = rectOf(ancestor);
    bounds = {
      bottom: Math.min(bounds.bottom, rect.bottom),
      left: Math.max(bounds.left, rect.left),
      right: Math.min(bounds.right, rect.right),
      top: Math.max(bounds.top, rect.top),
    };
  }
  return bounds;
}

function isVisible({ height, left, top, visible, width }: GhostRect): boolean {
  return (
    left < visible.right &&
    left + width > visible.left &&
    top < visible.bottom &&
    top + height > visible.top
  );
}

export interface GhostLayout {
  /** `"time"` boxes sit inside time columns; `"day"` boxes cover runs of day cells. */
  readonly axis: "day" | "time";
  readonly rects: readonly GhostRect[];
}

function instantEndpoints(
  placement: Exclude<CalendarEventPlacement, { kind: "all-day" }>,
  timeZone: string,
) {
  return placement.kind === "timed"
    ? { end: placement.end, start: placement.start }
    : {
        end: placement.end.toZonedDateTime(timeZone).toInstant(),
        start: placement.start.toZonedDateTime(timeZone).toInstant(),
      };
}

function timeColumnRects(
  surface: TargetSurface,
  placement: Exclude<CalendarEventPlacement, { kind: "all-day" }>,
  timeZone: string,
  rectOf: RectReader,
): GhostRect[] {
  const { end, start } = instantEndpoints(placement, timeZone);
  return timeColumns(surface).flatMap((cell) => {
    const column = surface.columns.get(cell.getAttribute("data-date")!)!;
    const day = column.day.interval;
    if (day === null) return [];
    const from = Temporal.Instant.compare(start, day.start) > 0 ? start : day.start;
    const to = Temporal.Instant.compare(end, day.end) < 0 ? end : day.end;
    if (Temporal.Instant.compare(from, to) >= 0) return [];

    const box = timedFragmentBox(column, instantInterval(from, to));
    const rect = rectOf(cell);
    return [
      {
        height: box.height * rect.height,
        left: rect.left,
        top: rect.top + box.top * rect.height,
        visible: visibleBounds(surface, cell, rectOf),
        width: rect.width,
      },
    ];
  });
}

function sameBounds(left: Bounds, right: Bounds): boolean {
  return (
    left.bottom === right.bottom &&
    left.left === right.left &&
    left.right === right.right &&
    left.top === right.top
  );
}

/**
 * The rendered dates a placement has time on, from the projection's own day splitting: a date the
 * zone skipped gets none, and a date that a jump back across midnight repeats keeps its share.
 * Splitting stays within the rendered dates, however long the event is.
 */
function touchedDates(
  placement: CalendarEventPlacement<ResourceId>,
  rendered: readonly string[],
  timeZone: string,
): ReadonlySet<string> {
  if (rendered.length === 0) return new Set();
  const dates = rendered.map((date) => Temporal.PlainDate.from(date)).toSorted(comparePlainDates);
  const range = plainDateInterval(dates[0]!, dates.at(-1)!.add({ days: 1 }));
  const event: NormalizedCalendarEvent<null, string, ResourceId> = {
    ...placement,
    event: null,
    id: "preview",
    inputIndex: 0,
    isReadOnly: false,
    title: "",
  };
  return new Set(splitEventsByDay([event], range, timeZone).map(({ date }) => date.toString()));
}

/**
 * Covers the day cells in the placement's dates. Neighbours on the same row merge when the same
 * ancestors clip them.
 */
function dayCellRects(
  surface: TargetSurface,
  placement: CalendarEventPlacement<ResourceId>,
  timeZone: string,
  rectOf: RectReader,
): GhostRect[] {
  const cells = dayCells(surface);
  const dates = touchedDates(
    placement,
    cells.map((cell) => cell.getAttribute("data-date")!),
    timeZone,
  );
  const rects: GhostRect[] = [];

  for (const cell of cells) {
    if (!dates.has(cell.getAttribute("data-date")!)) continue;

    const rect = rectOf(cell);
    const visible = visibleBounds(surface, cell, rectOf);
    const previous = rects.at(-1);
    const adjacent =
      previous !== undefined &&
      sameBounds(previous.visible, visible) &&
      Math.abs(previous.top - rect.top) < 1 &&
      (Math.abs(previous.left + previous.width - rect.left) < 1 ||
        Math.abs(rect.right - previous.left) < 1);
    if (adjacent) {
      const left = Math.min(previous.left, rect.left);
      rects[rects.length - 1] = {
        ...previous,
        left,
        width: Math.max(previous.left + previous.width, rect.right) - left,
      };
    } else {
      rects.push({
        height: rect.height,
        left: rect.left,
        top: rect.top,
        visible,
        width: rect.width,
      });
    }
  }
  return rects;
}

/**
 * Viewport boxes that preview a placement where the view will render it: in time columns, or in
 * day cells for all-day and 24-hour-plus events, which a time grid shows in its all-day row.
 * Boxes outside their cell's scroll viewport are left out.
 */
export function ghostLayout(
  surface: TargetSurface,
  placement: CalendarEventPlacement<ResourceId>,
  timeZone: string,
): GhostLayout {
  const rects = new Map<Element, DOMRect>();
  const rectOf: RectReader = (element) => {
    let rect = rects.get(element);
    if (rect === undefined) {
      rect = element.getBoundingClientRect();
      rects.set(element, rect);
    }
    return rect;
  };
  const layout: GhostLayout =
    placement.kind !== "all-day" &&
    surface.columns.size > 0 &&
    !belongsInTimeGridAllDayRow(placement)
      ? { axis: "time", rects: timeColumnRects(surface, placement, timeZone, rectOf) }
      : { axis: "day", rects: dayCellRects(surface, placement, timeZone, rectOf) };
  return { ...layout, rects: layout.rects.filter(isVisible) };
}

/**
 * Fixed-position preview segments, moved with transforms so a drag never re-renders the view, and
 * clipped to their cells' scroll viewports. Segments are translucent clones of the dragged event,
 * or range boxes for creates and day cells; style them through `[data-calendar-ghost]` or the
 * `--calendar-ghost-*` custom properties.
 */
export class GhostLayer {
  readonly #className: string | undefined;
  #origin: HTMLElement | null = null;
  readonly #region: HTMLElement;
  readonly #segments: HTMLElement[] = [];
  #template: HTMLElement | null = null;

  constructor(region: HTMLElement, className: string | undefined) {
    this.#className = className;
    this.#region = region;
  }

  render(rects: readonly GhostRect[], template: HTMLElement | null): void {
    if (template !== this.#template) {
      this.clear();
      this.#template = template;
    }
    while (this.#segments.length < rects.length) this.#segments.push(this.#createSegment());
    while (this.#segments.length > rects.length) this.#segments.pop()!.remove();
    if (rects.length === 0) return;

    const origin = this.#containingBlockOrigin();
    rects.forEach((rect, index) => {
      const { style } = this.#segments[index]!;
      const { height, left, top, visible, width } = rect;
      // Insets keep the segment's full geometry and hide what its cell would clip.
      const insets = [
        visible.top - top,
        left + width - visible.right,
        top + height - visible.bottom,
        visible.left - left,
      ].map((inset) => Math.max(0, inset));
      style.width = `${width}px`;
      style.height = `${height}px`;
      style.transform = `translate3d(${left - origin.left}px, ${top - origin.top}px, 0)`;
      style.clipPath = insets.some((inset) => inset > 0)
        ? `inset(${insets.map((inset) => `${inset}px`).join(" ")})`
        : "";
    });
  }

  clear(): void {
    for (const segment of this.#segments) segment.remove();
    this.#segments.length = 0;
    this.#origin?.remove();
    this.#origin = null;
  }

  /**
   * Where a fixed `left: 0; top: 0` box actually sits. It is the viewport origin unless an
   * ancestor is transformed, which makes that ancestor the containing block of fixed elements.
   */
  #containingBlockOrigin(): DOMRect {
    if (this.#origin === null) {
      this.#origin = document.createElement("div");
      this.#origin.setAttribute("aria-hidden", "true");
      this.#origin.setAttribute("data-calendar-ghost-origin", "");
      Object.assign(this.#origin.style, {
        height: "0",
        left: "0",
        pointerEvents: "none",
        position: "fixed",
        top: "0",
        visibility: "hidden",
        width: "0",
      });
      this.#region.append(this.#origin);
    }
    return this.#origin.getBoundingClientRect();
  }

  #createSegment(): HTMLElement {
    const template = this.#template;
    const segment =
      template === null ? document.createElement("div") : (template.cloneNode(true) as HTMLElement);
    for (const attribute of ["data-dragging", "data-event-id", "data-event-id-type", "id"]) {
      segment.removeAttribute(attribute);
    }
    segment.setAttribute("aria-hidden", "true");
    segment.setAttribute("data-calendar-ghost", template === null ? "range" : "event");
    if (this.#className !== undefined) {
      segment.classList.add(...this.#className.split(/\s+/).filter(Boolean));
    }

    Object.assign(segment.style, {
      bottom: "auto",
      boxSizing: "border-box",
      left: "0",
      margin: "0",
      pointerEvents: "none",
      position: "fixed",
      right: "auto",
      top: "0",
      zIndex: "var(--calendar-ghost-z-index, 50)",
    });
    // The preview stays see-through, so events under it remain readable.
    Object.assign(
      segment.style,
      template === null
        ? {
            background: "var(--calendar-ghost-background, rgb(37 99 235 / 0.18))",
            borderRadius: "var(--calendar-ghost-radius, 6px)",
          }
        : {
            boxShadow: "var(--calendar-ghost-shadow, 0 6px 16px rgb(0 0 0 / 0.18))",
            opacity: "var(--calendar-ghost-opacity, 0.75)",
          },
    );
    this.#region.append(segment);
    return segment;
  }
}
