import {
  formatPlacementRange,
  type CalendarAnnouncementContext,
  type CalendarAnnouncementMessages,
  type CalendarAnnouncer,
  type CalendarEnvironmentBase,
  type CalendarEventInterval,
  type CalendarInteractionUpdate,
  type ResourceId,
  type ResourceTree,
} from "@moltenship/calendar-core";

import { createListeners } from "./listeners";
import type { CalendarStateSource } from "./types";

/** Connects the root's announcer to the live region that is mounted, if any. */
export interface AnnouncerChannel {
  readonly announcer: CalendarAnnouncer;
  /** Speaks through `speak` with `messages` until the cleanup runs; the latest mount wins. */
  readonly mount: (
    getMessages: () => CalendarAnnouncementMessages,
    speak: (text: string) => void,
  ) => () => void;
  /**
   * Speaks what `build` returns through the mounted live region, if any, with the context and
   * messages an interaction's announcement gets; an undo's text is built this way.
   */
  readonly say: (
    build: (
      context: CalendarAnnouncementContext,
      messages: CalendarAnnouncementMessages,
    ) => string | null,
  ) => void;
}

interface MountedAnnouncer {
  readonly getMessages: () => CalendarAnnouncementMessages;
  readonly speak: (text: string) => void;
}

function buildMessage(
  messages: CalendarAnnouncementMessages,
  update: CalendarInteractionUpdate,
  context: CalendarAnnouncementContext,
): string | null {
  // Each builder receives the update for its own phase.
  const build = messages[update.phase] as (
    update: CalendarInteractionUpdate,
    context: CalendarAnnouncementContext,
  ) => string | null;
  return build(update, context);
}

/** `getEnvironment` and `getResources` read the root's last commit when an update arrives. */
export function createAnnouncerChannel(
  getEnvironment: () => Pick<CalendarEnvironmentBase, "locale" | "timeZone">,
  getResources: () => ResourceTree,
): AnnouncerChannel {
  const mounted: MountedAnnouncer[] = [];

  function formatRange(placement: CalendarEventInterval): string {
    const { locale, timeZone } = getEnvironment();
    const format = mounted.at(-1)?.getMessages().formatRange ?? formatPlacementRange;
    return format(placement, { locale, timeZone });
  }

  function resourceTitle(resourceId: ResourceId): string | undefined {
    return getResources().byId.get(resourceId)?.resource.title;
  }

  function say(
    build: (
      context: CalendarAnnouncementContext,
      messages: CalendarAnnouncementMessages,
    ) => string | null,
  ): void {
    const current = mounted.at(-1);
    if (current === undefined) return;
    const { locale, timeZone } = getEnvironment();
    const text = build({ formatRange, locale, resourceTitle, timeZone }, current.getMessages());
    if (text !== null && text !== "") current.speak(text);
  }

  return Object.freeze({
    announcer: Object.freeze({
      announce: (update: CalendarInteractionUpdate) =>
        say((context, messages) => buildMessage(messages, update, context)),
      formatRange,
    }),
    mount(getMessages: () => CalendarAnnouncementMessages, speak: (text: string) => void) {
      const entry = { getMessages, speak };
      mounted.push(entry);
      return () => {
        const index = mounted.lastIndexOf(entry);
        if (index !== -1) mounted.splice(index, 1);
      };
    },
    say,
  });
}

/**
 * The text of a mounted live region, as a store: pass `speak` to `AnnouncerChannel.mount` and
 * render the snapshot as the region's text. A message that repeats the last one gets a trailing
 * no-break space, so the region changes and a screen reader reads it again. Empty until something
 * is said, on the server too.
 */
export interface AnnouncerLiveText extends CalendarStateSource<string> {
  readonly speak: (text: string) => void;
}

/** Creates the text of one mounted live region; see `AnnouncerLiveText`. */
export function createAnnouncerLiveText(): AnnouncerLiveText {
  let spoken = { repeat: false, text: "" };
  let snapshot = "";
  const listeners = createListeners();
  return Object.freeze({
    getServerSnapshot: () => "",
    getSnapshot: () => snapshot,
    speak(text: string) {
      spoken = { repeat: spoken.text === text && !spoken.repeat, text };
      snapshot = spoken.repeat ? `${text}\u00a0` : text;
      listeners.notify();
    },
    subscribe: listeners.subscribe,
  });
}
