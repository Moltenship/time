import {
  timedFragmentBox,
  toAllDayPlacement,
  type CalendarEventPlacement,
  type ResourceId,
} from "@moltenship/calendar-core";
import { instantInterval } from "@moltenship/calendar-temporal";

import { dayCells, timeColumns, type TargetSurface } from "./targets";

export interface GhostRect {
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
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
    const rect = cell.getBoundingClientRect();
    return [
      {
        height: box.height * rect.height,
        left: rect.left,
        top: rect.top + box.top * rect.height,
        width: rect.width,
      },
    ];
  });
}

/** Covers the day cells in the placement's dates, merging neighbours on the same row. */
function dayCellRects(
  surface: TargetSurface,
  placement: CalendarEventPlacement<ResourceId>,
  timeZone: string,
): GhostRect[] {
  const days = toAllDayPlacement(placement, { timeZone });
  const first = days.start.toString();
  const last = days.end.toString();
  const rects: GhostRect[] = [];

  for (const cell of dayCells(surface)) {
    // ISO dates order lexicographically.
    const date = cell.getAttribute("data-date")!;
    if (date < first || date >= last) continue;

    const rect = cell.getBoundingClientRect();
    const previous = rects.at(-1);
    const adjacent =
      previous !== undefined &&
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
      rects.push({ height: rect.height, left: rect.left, top: rect.top, width: rect.width });
    }
  }
  return rects;
}

/** Viewport boxes that preview a placement on the rendered view. */
export function ghostLayout(
  surface: TargetSurface,
  placement: CalendarEventPlacement<ResourceId>,
  timeZone: string,
): GhostLayout {
  return placement.kind !== "all-day" && surface.columns.size > 0
    ? { axis: "time", rects: timeColumnRects(surface, placement, timeZone) }
    : { axis: "day", rects: dayCellRects(surface, placement, timeZone) };
}

/**
 * Fixed-position preview segments, moved with transforms so a drag never re-renders the view.
 * Segments clone the dragged event, or are plain range boxes for creates and day cells; style them
 * through `[data-calendar-ghost]` or the `--calendar-ghost-*` custom properties.
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
      style.width = `${rect.width}px`;
      style.height = `${rect.height}px`;
      style.transform = `translate3d(${rect.left - origin.left}px, ${rect.top - origin.top}px, 0)`;
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
    if (template === null) {
      Object.assign(segment.style, {
        background: "var(--calendar-ghost-background, rgb(37 99 235 / 0.18))",
        borderRadius: "var(--calendar-ghost-radius, 6px)",
      });
    }
    this.#region.append(segment);
    return segment;
  }
}
