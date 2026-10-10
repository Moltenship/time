import {
  showsInResource,
  type CalendarEventPlacement,
  type ResourceId,
  type TimeGridColumn,
} from "@moltenship/calendar-core";

import type { PointerTarget } from "./gestures";
import { resourceIdOf } from "./resource-id";

export interface TargetSurface {
  /** Each cell's overflow-clipping ancestors, found once per gesture. */
  readonly clippers: Map<Element, readonly Element[]>;
  /** Time-grid columns by ISO date; `[data-date]` elements matching one map height to time. */
  readonly columns: ReadonlyMap<string, TimeGridColumn>;
  readonly region: HTMLElement;
}

/** The cell's resource, left out in views without resources. */
function resourceOf(cell: Element): { readonly resourceId?: ResourceId | null } {
  const resourceId = resourceIdOf(cell);
  return resourceId === undefined ? {} : { resourceId };
}

/** Whether a placement shows in a cell's resource; cells outside any resource show all. */
export function showsInCell(placement: CalendarEventPlacement, cell: Element): boolean {
  const resourceId = resourceIdOf(cell);
  return resourceId === undefined || showsInResource(placement.resourceIds, resourceId);
}

/** Whether a time column runs along the inline axis, as a timeline's date strip does. */
export function isInline(cell: Element): boolean {
  return cell.getAttribute("data-axis") === "inline";
}

/** Whether the inline axis runs from the right, as `dir="rtl"` on an ancestor sets. */
export function isRightToLeft(cell: Element): boolean {
  return cell.closest("[dir]")?.getAttribute("dir") === "rtl";
}

/** How far through its day a point is in a time column: down it, or from its inline start. */
function along(cell: Element, x: number, y: number): number {
  const rect = cell.getBoundingClientRect();
  if (!isInline(cell)) return rect.height > 0 ? (y - rect.top) / rect.height : 0;
  if (rect.width <= 0) return 0;
  return (isRightToLeft(cell) ? rect.right - x : x - rect.left) / rect.width;
}

export function isTimeColumn(surface: TargetSurface, cell: Element): boolean {
  const date = cell.getAttribute("data-date");
  return date !== null && !cell.hasAttribute("data-all-day") && surface.columns.has(date);
}

/** Day cells: month cells, or the all-day row of a time grid. */
export function dayCells(surface: TargetSurface): HTMLElement[] {
  return [...surface.region.querySelectorAll<HTMLElement>("[data-date]")].filter(
    (cell) => !isTimeColumn(surface, cell),
  );
}

export function timeColumns(surface: TargetSurface): HTMLElement[] {
  return [...surface.region.querySelectorAll<HTMLElement>("[data-date]")].filter((cell) =>
    isTimeColumn(surface, cell),
  );
}

/**
 * The day cell or point in a time column under a viewport point, in the resource around the cell.
 * Hit-testing every element at the point finds the cell beneath events that span several cells;
 * a part marked `data-occludes`, such as a sticky header, hides the cells scrolled beneath it.
 */
export function targetAt(surface: TargetSurface, x: number, y: number): PointerTarget | null {
  for (const element of document.elementsFromPoint(x, y)) {
    if (element.closest("[data-occludes]") !== null) return null;
    const cell = element.closest<HTMLElement>("[data-date]");
    if (cell === null || !surface.region.contains(cell)) continue;

    const date = cell.getAttribute("data-date")!;
    const resource = resourceOf(cell);
    const column = isTimeColumn(surface, cell) ? surface.columns.get(date) : undefined;
    if (column === undefined) {
      return { date: Temporal.PlainDate.from(date), kind: "day", ...resource };
    }

    return { column, kind: "time", y: along(cell, x, y), ...resource };
  }
  return null;
}
