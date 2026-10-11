import type {
  CalendarCellFocus,
  CalendarFocus,
  CalendarInteractionCheck,
  CalendarKeyboardSession,
  CalendarPendingPlacements,
  EventId,
  NormalizedCalendarEvent,
  ResourceId,
} from "@moltenship/calendar-core";

import type { CalendarStateSource } from "./context";

/** A keyboard session with what it needs to restart, restore focus, and announce itself. */
export interface KeyboardGrab {
  /** The cell the grabbed event sits in, or where a create started. */
  readonly cell: CalendarCellFocus;
  /** What the root's policies say about the session's proposal. */
  readonly check: CalendarInteractionCheck;
  /** The event as it was when grabbed; `null` when creating. */
  readonly event: NormalizedCalendarEvent<unknown, EventId, ResourceId> | null;
  /** Focus before the grab, restored on cancel. */
  readonly origin: CalendarFocus;
  readonly session: CalendarKeyboardSession;
}

/** The root's keyboard session. Its preview patches the grabbed event into the projection. */
export interface KeyboardSessionStore {
  readonly get: () => KeyboardGrab | null;
  /** The grabbed event's proposed placement, for `applyEventOverlay`. */
  readonly getPreview: () => CalendarPendingPlacements<EventId, ResourceId>;
  /** The gesture in progress, for `useCalendarInteraction`. */
  readonly grabs: CalendarStateSource<KeyboardGrab | null>;
  readonly set: (grab: KeyboardGrab | null) => void;
  readonly subscribe: (listener: () => void) => () => void;
}

const noPreview: CalendarPendingPlacements<EventId, ResourceId> = new Map();

export function createKeyboardSessionStore(): KeyboardSessionStore {
  let grab: KeyboardGrab | null = null;
  let preview = noPreview;
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  return Object.freeze({
    get: () => grab,
    getPreview: () => preview,
    grabs: Object.freeze({ getSnapshot: () => grab, subscribe }),
    set(next: KeyboardGrab | null) {
      if (next === grab) return;
      grab = next;
      const session = next?.session;
      preview =
        session?.eventId == null ? noPreview : new Map([[session.eventId, session.proposed]]);
      for (const listener of listeners) listener();
    },
    subscribe,
  });
}
