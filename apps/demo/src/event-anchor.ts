import { eventIdOf, type EventId } from "@moltenship/calendar";
import { useEffect, type RefObject } from "react";

/** The event's first element in document order, such as its first fragment, or `null`. */
export function findEventElement(container: ParentNode, eventId: EventId): HTMLElement | null {
  for (const element of container.querySelectorAll<HTMLElement>("[data-event-id]")) {
    if (eventIdOf(element) === eventId) return element;
  }
  return null;
}

/**
 * Keeps a popover's anchor on its event while views re-render it. Moving an event to another day
 * or to the all-day row replaces its element, so once the anchor leaves the document this reports
 * the event's current element, or `null` when the event is no longer shown.
 */
export function useFollowEventElement(
  container: RefObject<HTMLElement | null>,
  anchor: HTMLElement | null,
  eventId: EventId | null,
  onAnchorChange: (anchor: HTMLElement | null) => void,
) {
  useEffect(() => {
    const root = container.current;
    if (root === null || anchor === null || eventId === null) return;
    const observer = new MutationObserver(() => {
      if (!anchor.isConnected) onAnchorChange(findEventElement(root, eventId));
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [anchor, container, eventId, onAnchorChange]);
}
