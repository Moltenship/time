import { act } from "react";

/** jsdom has no layout: give elements viewport boxes and hit-test them topmost first. */
export function layOut(boxes: readonly (readonly [Element, DOMRectInit])[]) {
  for (const [element, { height = 0, width = 0, x = 0, y = 0 }] of boxes) {
    element.getBoundingClientRect = () =>
      ({ bottom: y + height, height, left: x, right: x + width, top: y, width, x, y }) as DOMRect;
  }
  document.elementsFromPoint = (x: number, y: number) =>
    boxes
      .map(([element]) => element)
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return x >= box.left && x < box.right && y >= box.top && y < box.bottom;
      });
}

/** Dispatches a primary mouse pointer event at a viewport point. */
export function pointer(element: Element, type: string, [x, y]: readonly [number, number]) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperties(event, {
    isPrimary: { value: true },
    pointerId: { value: 1 },
    pointerType: { value: "mouse" },
  });
  element.dispatchEvent(event);
}

export function drag(element: Element, points: readonly (readonly [number, number])[]) {
  act(() => {
    pointer(element, "pointerdown", points[0]!);
    for (const point of points.slice(1)) pointer(element, "pointermove", point);
    pointer(element, "pointerup", points.at(-1)!);
  });
}
