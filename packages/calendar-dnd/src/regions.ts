import type { EventId, ResourceId } from "@moltenship/calendar-core";

import type { CalendarPointerOptions } from "./attach-calendar-pointer";
import { reportCallbackError } from "./drags";

/** A view region the pointer layer is attached to, with the options its view passes. */
export interface PointerRegion {
  readonly element: HTMLElement;
  readonly getOptions: () => CalendarPointerOptions<unknown, EventId, ResourceId>;
}

/** A calendar view's region, as a binding to a drag-and-drop library sees it. */
export interface CalendarRegion {
  /** Whether its gestures are off, as on a read-only root: then it takes no drops either. */
  readonly disabled: boolean;
  /** The element the view passed to `useCalendarPointer` or `attachCalendarPointer`. */
  readonly element: HTMLElement;
}

const regions = new Set<PointerRegion>();
const observers = new Set<(regions: readonly CalendarRegion[]) => void>();

function isEnabled(region: PointerRegion): boolean {
  return region.getOptions().disabled !== true;
}

function snapshot(): readonly CalendarRegion[] {
  return Object.freeze(
    [...regions].map((region) =>
      Object.freeze({ disabled: !isEnabled(region), element: region.element }),
    ),
  );
}

/** Tells an observer the regions, reporting what it throws instead of breaking an attach. */
function tell(
  observer: (regions: readonly CalendarRegion[]) => void,
  current: readonly CalendarRegion[],
) {
  try {
    observer(current);
  } catch (error) {
    reportCallbackError(error);
  }
}

function notify(): void {
  if (observers.size === 0) return;
  const current = snapshot();
  for (const observer of observers) tell(observer, current);
}

/** Lists a region while it's attached, so drags from outside the calendar can find it. */
export function registerRegion(region: PointerRegion): () => void {
  regions.add(region);
  notify();
  return () => {
    if (regions.delete(region)) notify();
  };
}

/**
 * Hears the calendar views on the page: once now, and again whenever a view's region attaches or
 * detaches. A region that turns read-only attaches again, so `disabled` follows it. Returns a
 * function that stops listening.
 */
export function observeCalendarRegions(
  observer: (regions: readonly CalendarRegion[]) => void,
): () => void {
  observers.add(observer);
  tell(observer, snapshot());
  return () => {
    observers.delete(observer);
  };
}

/** Whether a region is still attached and takes drops. */
export function takesDrops(region: PointerRegion): boolean {
  return regions.has(region) && isEnabled(region);
}

/**
 * The region that takes drops under a viewport point, with the element hit there: the topmost
 * one, so anything over the view, such as a sheet, a dialog or a read-only view, hides it.
 * Elements the pointer goes through (`pointer-events: none`), as drag images do, don't count.
 */
export function regionAt(
  x: number,
  y: number,
): { readonly element: Element; readonly region: PointerRegion } | null {
  if (regions.size === 0) return null;
  const [element] = document.elementsFromPoint(x, y);
  if (element === undefined) return null;
  for (const region of regions) {
    if (region.element.contains(element)) return isEnabled(region) ? { element, region } : null;
  }
  return null;
}
