import type { CalendarDraft, EventId, ResourceId } from "@moltenship/calendar-core";

import { createListeners } from "./listeners";
import type { CalendarStateSource } from "./types";

type AnyDraft = CalendarDraft<EventId, ResourceId>;

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
