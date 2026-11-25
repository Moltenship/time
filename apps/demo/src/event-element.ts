import { eventIdOf, type EventId } from "@moltenship/calendar";

/** Whether any of the element shows inside the window and every scrolling or clipping ancestor. */
function isInView(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  let top = 0;
  let right = window.innerWidth;
  let bottom = window.innerHeight;
  let left = 0;
  for (let parent = element.parentElement; parent !== null; parent = parent.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(parent);
    if (!/auto|scroll|hidden|clip/.test(`${overflowX} ${overflowY}`)) continue;
    const clip = parent.getBoundingClientRect();
    top = Math.max(top, clip.top);
    right = Math.min(right, clip.right);
    bottom = Math.min(bottom, clip.bottom);
    left = Math.max(left, clip.left);
  }
  return rect.bottom > top && rect.top < bottom && rect.right > left && rect.left < right;
}

/**
 * The element to anchor an event's popover to: its first fragment that is in view, so an overnight
 * event's visible part wins over one scrolled away, otherwise its first fragment, or `null`.
 */
export function findEventElement(container: ParentNode, eventId: EventId): HTMLElement | null {
  const fragments = [...container.querySelectorAll<HTMLElement>("[data-event-id]")].filter(
    (element) => eventIdOf(element) === eventId,
  );
  return fragments.find(isInView) ?? fragments[0] ?? null;
}
