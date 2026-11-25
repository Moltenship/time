import type {
  CalendarDraft,
  CalendarKeyboardSession,
  EventId,
  ResourceId,
} from "@moltenship/calendar-core";

import type { KeyboardSessionStore } from "./keyboard-store";
import { createListeners } from "./listeners";
import type { CalendarStateSource } from "./types";

export type AnyDraft = CalendarDraft<EventId, ResourceId>;

/** The pointer's draft, which the pointer layer reports to the root while a drag previews a change. */
export interface DraftStore extends CalendarStateSource<AnyDraft | null> {
  readonly set: (draft: AnyDraft | null) => void;
}

export function createDraftStore(): DraftStore {
  let draft: AnyDraft | null = null;
  const listeners = createListeners();
  return Object.freeze({
    getSnapshot: () => draft,
    set(next: AnyDraft | null) {
      if (next === draft) return;
      draft = next;
      listeners.notify();
    },
    subscribe: listeners.subscribe,
  });
}

/** Each keyboard session as a draft, the same object for as long as the session is. */
const sessionDrafts = new WeakMap<CalendarKeyboardSession, AnyDraft>();

function draftOf(session: CalendarKeyboardSession): AnyDraft {
  let draft = sessionDrafts.get(session);
  if (draft === undefined) {
    draft = Object.freeze({ eventId: session.eventId, proposed: session.proposed });
    sessionDrafts.set(session, draft);
  }
  return draft;
}

const noDraft = () => null;

/**
 * The change being drafted, by keyboard or pointer: the keyboard's session while one is in
 * progress, else the pointer's draft. The server and hydration read none.
 */
export function createDraftSource(
  keyboard: KeyboardSessionStore,
  pointerDraft: DraftStore,
): CalendarStateSource<AnyDraft | null> {
  return Object.freeze({
    getServerSnapshot: noDraft,
    getSnapshot: () => {
      const session = keyboard.grabs.getSnapshot()?.session;
      return session === undefined ? pointerDraft.getSnapshot() : draftOf(session);
    },
    subscribe: (listener: () => void) => {
      const stops = [keyboard.grabs.subscribe(listener), pointerDraft.subscribe(listener)];
      return () => {
        for (const stop of stops) stop();
      };
    },
  });
}
