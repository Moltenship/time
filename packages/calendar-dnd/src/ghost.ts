import {
  belongsInTimeGridAllDayRow,
  type CalendarInteractionCheck,
  splitEventsByDay,
  timedFragmentBox,
  timelineExtent,
  type CalendarEventPlacement,
  type NormalizedCalendarEvent,
  type ResourceId,
} from "@moltenship/calendar-core";
import {
  comparePlainDates,
  instantInterval,
  plainDateInterval,
} from "@moltenship/calendar-temporal";

import {
  dayCells,
  isInline,
  isRightToLeft,
  showsInCell,
  timeColumns,
  type TargetSurface,
} from "./targets";

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
    if (isInline(cell) || !showsInCell(placement, cell)) return [];
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

/**
 * Boxes along a timeline's date strips, measured as the timeline lays out its bars: every kind of
 * placement, all-day and day-long ones included, with floating ones on their wall clock.
 */
function inlineStripRects(
  surface: TargetSurface,
  strips: readonly HTMLElement[],
  placement: CalendarEventPlacement<ResourceId>,
  rectOf: RectReader,
): GhostRect[] {
  return strips.flatMap((cell) => {
    if (!showsInCell(placement, cell)) return [];
    const column = surface.columns.get(cell.getAttribute("data-date")!)!;
    const extent = timelineExtent([column], placement);
    if (extent === null) return [];
    const rect = rectOf(cell);
    const width = (extent.end - extent.start) * rect.width;
    const offset = extent.start * rect.width;
    const left = isRightToLeft(cell) ? rect.right - offset - width : rect.left + offset;
    return [
      {
        height: rect.height,
        left,
        top: rect.top,
        visible: visibleBounds(surface, cell, rectOf),
        width,
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
    if (!dates.has(cell.getAttribute("data-date")!) || !showsInCell(placement, cell)) continue;

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
 * Viewport boxes that preview a placement where the view will render it: along a timeline's date
 * strips, in time columns, or in day cells for all-day and 24-hour-plus events, which a time grid
 * shows in its all-day row. In a resource view only the placement's resources get boxes. Boxes
 * outside their cell's scroll viewport are left out.
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
  const strips = timeColumns(surface).filter(isInline);
  const layout: GhostLayout =
    strips.length > 0
      ? { axis: "time", rects: inlineStripRects(surface, strips, placement, rectOf) }
      : placement.kind !== "all-day" &&
          surface.columns.size > 0 &&
          !belongsInTimeGridAllDayRow(placement)
        ? { axis: "time", rects: timeColumnRects(surface, placement, timeZone, rectOf) }
        : { axis: "day", rects: dayCellRects(surface, placement, timeZone, rectOf) };
  return { ...layout, rects: layout.rects.filter(isVisible) };
}

/** `invalid` when a policy would reject the drop, `warning` when one would flag it. */
export type GhostValidity = "invalid" | "warning" | null;

/** How a preview shows what the policies say: rejected, flagged, or fine. */
export function ghostValidity(check: CalendarInteractionCheck): GhostValidity {
  if (check === null) return null;
  if (check.status === "rejected") return "invalid";
  return check.change.warnings !== undefined && check.change.warnings.length > 0 ? "warning" : null;
}

/** A box in viewport coordinates, as `getBoundingClientRect` gives it. */
export interface GhostBox {
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
}

/**
 * How long a free preview takes to settle where it lands, unless the computed
 * `transition-duration` says otherwise; see `--calendar-ghost-settle-duration`.
 */
const SETTLE_MS = 150;
const SETTLE_TRANSITION = ["transform", "width", "height"]
  .map(
    (property) =>
      `${property} var(--calendar-ghost-settle-duration, ${SETTLE_MS}ms) var(--calendar-ghost-settle-easing, ease-out)`,
  )
  .join(", ");

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The longest of an element's computed transition durations, in milliseconds. */
function transitionMs(element: HTMLElement): number {
  const durations = getComputedStyle(element)
    .transitionDuration.split(",")
    .map((duration) => {
      const value = Number.parseFloat(duration);
      return duration.trim().endsWith("ms") ? value : value * 1000;
    })
    .filter(Number.isFinite);
  return durations.length === 0 ? SETTLE_MS : Math.max(...durations);
}

/**
 * Starts `segments` sliding to where `place` puts them, then removes them and `cleanup`'s parts.
 * The current position is read first, so the change transitions from it.
 */
function settle(
  segments: readonly HTMLElement[],
  place: (segment: HTMLElement, index: number) => void,
  cleanup: () => void,
): void {
  const remove = () => {
    for (const segment of segments) segment.remove();
    cleanup();
  };
  const [first] = segments;
  if (first === undefined || prefersReducedMotion()) {
    remove();
    return;
  }
  for (const segment of segments) {
    // Commits the position the segment leaves from.
    void getComputedStyle(segment).transform;
    segment.style.transition = SETTLE_TRANSITION;
    segment.setAttribute("data-settling", "");
  }
  segments.forEach(place);
  setTimeout(remove, transitionMs(first) + 20);
}

/**
 * Finds where a fixed `left: 0; top: 0` box actually sits. It is the viewport origin unless an
 * ancestor is transformed, which makes that ancestor the containing block of fixed elements.
 */
class OriginProbe {
  #element: HTMLElement | null = null;
  readonly #region: HTMLElement;

  constructor(region: HTMLElement) {
    this.#region = region;
  }

  measure(): DOMRect {
    if (this.#element === null) {
      this.#element = document.createElement("div");
      this.#element.setAttribute("aria-hidden", "true");
      this.#element.setAttribute("data-calendar-ghost-origin", "");
      Object.assign(this.#element.style, {
        height: "0",
        left: "0",
        pointerEvents: "none",
        position: "fixed",
        top: "0",
        visibility: "hidden",
        width: "0",
      });
      this.#region.append(this.#element);
    }
    return this.#element.getBoundingClientRect();
  }

  remove(): void {
    this.#element?.remove();
    this.#element = null;
  }
}

/** What a layer's segments are: `"landing"` marks where a free drag would land. */
type GhostLayerKind = "landing" | "preview";

/**
 * Fixed-position preview segments, moved with transforms so a drag never re-renders the view, and
 * clipped to their cells' scroll viewports. Segments are translucent clones of the dragged event,
 * or range boxes for creates and day cells; style them through `[data-calendar-ghost]` or the
 * `--calendar-ghost-*` custom properties. A clone's `[data-event-time]` shows `label`, and
 * `data-invalid` or `data-warning` marks a drop the policies would reject or flag. A clone that
 * follows the pointer outside the view, toward a drop zone of the app's, has `data-outside`.
 *
 * A `"landing"` layer draws the boxes where a free drag (`preview: "free"`) would land, as
 * `[data-calendar-ghost="landing"]`, styled through `--calendar-ghost-landing-background` and
 * `--calendar-ghost-landing-shadow`.
 */
export class GhostLayer {
  readonly #className: string | undefined;
  readonly #kind: GhostLayerKind;
  #outside = false;
  #origin: OriginProbe;
  readonly #region: HTMLElement;
  readonly #segments: HTMLElement[] = [];
  #template: HTMLElement | null = null;

  constructor(
    region: HTMLElement,
    className: string | undefined,
    kind: GhostLayerKind = "preview",
  ) {
    this.#className = className;
    this.#kind = kind;
    this.#origin = new OriginProbe(region);
    this.#region = region;
  }

  /**
   * Shows `rects`: copies of `template`, or range boxes without one. `outside` marks a copy that
   * follows the pointer outside the view (`data-outside`).
   */
  render(
    rects: readonly GhostRect[],
    template: HTMLElement | null,
    label: string | null,
    validity: GhostValidity = null,
    outside = false,
  ): void {
    // A copy that leaves the view starts over, so it shows the event's own time again.
    if (template !== this.#template || outside !== this.#outside) {
      this.clear();
      this.#template = template;
      this.#outside = outside;
    }
    while (this.#segments.length < rects.length) this.#segments.push(this.#createSegment());
    while (this.#segments.length > rects.length) this.#segments.pop()!.remove();
    if (rects.length === 0) return;

    const origin = this.#origin.measure();
    rects.forEach((rect, index) => {
      const segment = this.#segments[index]!;
      this.#place(segment, rect, origin);
      segment.toggleAttribute("data-invalid", validity === "invalid");
      segment.toggleAttribute("data-warning", validity === "warning");
      segment.toggleAttribute("data-outside", outside);
      if (label === null) return;
      for (const time of segment.querySelectorAll("[data-event-time]")) {
        time.textContent = label;
      }
    });
  }

  clear(): void {
    for (const segment of this.#segments) segment.remove();
    this.#segments.length = 0;
    this.#origin.remove();
  }

  /**
   * Slides the segments onto `rects`, one for one, and removes them once there; without as many
   * rects, or under reduced motion, removes them at once. The layer is left empty for reuse.
   */
  settle(rects: readonly GhostRect[]): void {
    const segments = this.#segments.splice(0);
    const origin = this.#origin;
    this.#origin = new OriginProbe(this.#region);
    if (rects.length !== segments.length) {
      for (const segment of segments) segment.remove();
      origin.remove();
      return;
    }
    const at = origin.measure();
    settle(
      segments,
      (segment, index) => this.#place(segment, rects[index]!, at),
      () => origin.remove(),
    );
  }

  #place(segment: HTMLElement, rect: GhostRect, origin: DOMRect): void {
    const { style } = segment;
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
  }

  #createSegment(): HTMLElement {
    const template = this.#template;
    return ghostSegment(
      this.#region,
      template,
      this.#className,
      this.#kind === "landing" ? "landing" : template === null ? "range" : "event",
    );
  }
}

/**
 * A see-through copy of `template`, or a range box without one, fixed over the view: the parts of
 * every preview.
 */
function ghostSegment(
  region: HTMLElement,
  template: HTMLElement | null,
  className: string | undefined,
  kind: "event" | "landing" | "range",
): HTMLElement {
  const segment =
    template === null ? document.createElement("div") : (template.cloneNode(true) as HTMLElement);
  for (const attribute of ["data-dragging", "data-event-id", "data-event-id-type", "id"]) {
    segment.removeAttribute(attribute);
  }
  segment.setAttribute("aria-hidden", "true");
  segment.setAttribute("data-calendar-ghost", kind);
  if (className !== undefined) {
    segment.classList.add(...className.split(/\s+/).filter(Boolean));
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
    // Where a free drag would land sits under the copy that follows the pointer.
    zIndex:
      kind === "landing"
        ? "calc(var(--calendar-ghost-z-index, 50) - 1)"
        : "var(--calendar-ghost-z-index, 50)",
  });
  // The preview stays see-through, so events under it remain readable.
  Object.assign(
    segment.style,
    kind === "landing"
      ? {
          background: "var(--calendar-ghost-landing-background, rgb(37 99 235 / 0.1))",
          borderRadius: "var(--calendar-ghost-radius, 6px)",
          boxShadow:
            "var(--calendar-ghost-landing-shadow, inset 0 0 0 1.5px rgb(37 99 235 / 0.45))",
        }
      : template === null
        ? {
            background: "var(--calendar-ghost-background, rgb(37 99 235 / 0.18))",
            borderRadius: "var(--calendar-ghost-radius, 6px)",
          }
        : {
            boxShadow: "var(--calendar-ghost-shadow, 0 6px 16px rgb(0 0 0 / 0.18))",
            opacity: "var(--calendar-ghost-opacity, 0.75)",
          },
  );
  region.append(segment);
  return segment;
}

/**
 * The copy of a moved event that a free drag (`preview: "free"`) moves with the pointer, pixel for
 * pixel: the event's box at the press, carried by how far the pointer has gone since. It keeps the
 * event's size, isn't clipped to cells, and passes over the landing boxes. Its `[data-event-time]`
 * shows the range a drop would propose; `data-outside` marks it where there's nothing to drop on.
 */
export class GhostClone {
  readonly #box: GhostBox;
  readonly #element: HTMLElement;
  #label: string | null = null;
  #origin: DOMRect;
  readonly #probe: OriginProbe;
  readonly #press: { readonly x: number; readonly y: number };
  #point: { readonly x: number; readonly y: number };
  /** The time labels and what they said, restored where there's nothing to drop on. */
  readonly #times: readonly (readonly [Element, string | null])[];
  #validity: GhostValidity = null;
  #outside = false;

  constructor(
    region: HTMLElement,
    template: HTMLElement,
    className: string | undefined,
    press: { readonly x: number; readonly y: number },
  ) {
    const rect = template.getBoundingClientRect();
    this.#box = { height: rect.height, left: rect.left, top: rect.top, width: rect.width };
    this.#press = press;
    this.#point = press;
    this.#probe = new OriginProbe(region);
    this.#origin = this.#probe.measure();
    this.#element = ghostSegment(region, template, className, "event");
    this.#element.style.width = `${rect.width}px`;
    this.#element.style.height = `${rect.height}px`;
    this.#times = [...this.#element.querySelectorAll("[data-event-time]")].map(
      (time) => [time, time.textContent] as const,
    );
  }

  /** The copy's box now, in viewport coordinates. */
  get rect(): GhostBox {
    return {
      ...this.#box,
      left: this.#box.left + this.#point.x - this.#press.x,
      top: this.#box.top + this.#point.y - this.#press.y,
    };
  }

  /** Puts the copy under the pointer: one transform write. */
  follow(point: { readonly x: number; readonly y: number }): void {
    this.#point = point;
    const { left, top } = this.rect;
    this.#element.style.transform = `translate3d(${left - this.#origin.left}px, ${top - this.#origin.top}px, 0)`;
  }

  /**
   * Shows the range a drop would propose, or the event's own with `null`, and what the policies
   * say; `outside` marks the copy where there's nothing to drop on.
   */
  mark(label: string | null, validity: GhostValidity, outside: boolean): void {
    if (label !== this.#label) {
      this.#label = label;
      for (const [time, text] of this.#times) time.textContent = label ?? text;
    }
    if (validity !== this.#validity) {
      this.#validity = validity;
      this.#element.toggleAttribute("data-invalid", validity === "invalid");
      this.#element.toggleAttribute("data-warning", validity === "warning");
    }
    if (outside !== this.#outside) {
      this.#outside = outside;
      this.#element.toggleAttribute("data-outside", outside);
    }
  }

  /** Finds the fixed-position origin again, after a scroll that may have carried it. */
  measure(): void {
    this.#origin = this.#probe.measure();
    this.follow(this.#point);
  }

  /** Slides the copy onto `target` and removes it there; at once without one. */
  settle(target: GhostBox | null): void {
    if (target === null) {
      this.remove();
      return;
    }
    settle(
      [this.#element],
      ({ style }) => {
        style.width = `${target.width}px`;
        style.height = `${target.height}px`;
        style.transform = `translate3d(${target.left - this.#origin.left}px, ${target.top - this.#origin.top}px, 0)`;
      },
      () => this.#probe.remove(),
    );
  }

  remove(): void {
    this.#element.remove();
    this.#probe.remove();
  }
}
