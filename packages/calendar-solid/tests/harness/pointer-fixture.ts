import type { CalendarEvent } from "@moltenship/calendar-core";

/**
 * jsdom has no layout, hit testing, or PointerEvent. These helpers give fixture elements fixed
 * viewport rectangles and hit-test them topmost-first, like the browser does; the pointer layer's
 * own tests (`packages/calendar-dnd/tests/dom-fixture.ts`) use the same geometry.
 */

export type TestEvent = CalendarEvent<null, string | number, string>;

interface Box {
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
}

const layers: Element[][] = [[], [], []];

export function place(element: HTMLElement, box: Box, layer: 0 | 1 | 2): HTMLElement {
  element.getBoundingClientRect = () =>
    ({
      ...box,
      bottom: box.top + box.height,
      right: box.left + box.width,
      x: box.left,
      y: box.top,
    }) as DOMRect;
  layers[layer]!.push(element);
  return element;
}

function contains(element: Element, x: number, y: number): boolean {
  const rect = element.getBoundingClientRect();
  return x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom;
}

export function resetLayout(): void {
  for (const layer of layers) layer.length = 0;
  document.body.replaceChildren();
  document.elementsFromPoint = (x: number, y: number) =>
    layers.flatMap((layer) =>
      layer.filter((element) => element.isConnected && contains(element, x, y)),
    );
}

export function pointer(
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  target: EventTarget,
  x: number,
  y: number,
  { pointerType = "mouse" }: { readonly pointerType?: string } = {},
): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperties(event, {
    isPrimary: { value: true },
    pointerId: { value: 1 },
    pointerType: { value: pointerType },
  });
  target.dispatchEvent(event);
  return event;
}

export const timeZone = "UTC";

/** Time grid: an all-day row 40px tall above 100px-wide columns at 40px per hour. */
export const ALL_DAY_HEIGHT = 40;
export const HOUR_HEIGHT = 40;
export const COLUMN_WIDTH = 100;

export function yAt(time: string): number {
  const { hour, minute } = Temporal.PlainTime.from(time);
  return ALL_DAY_HEIGHT + (hour + minute / 60) * HOUR_HEIGHT;
}

export function timedEvent(
  id: string | number,
  start: string,
  end: string,
  title = String(id),
): TestEvent {
  return {
    data: null,
    end: Temporal.Instant.from(end),
    id,
    kind: "timed",
    start: Temporal.Instant.from(start),
    title,
  };
}
