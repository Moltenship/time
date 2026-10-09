import {
  formatPlacementRange,
  type CalendarAnnouncementContext,
  type CalendarAnnouncementMessages,
  type CalendarAnnouncer,
  type CalendarEnvironmentBase,
  type CalendarEventInterval,
  type CalendarInteractionUpdate,
} from "@moltenship/calendar-core";
import {
  createElement,
  useInsertionEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";

import type { CalendarAnnouncerProps } from "./calendar-types";
import { useInteractionRuntime } from "./interaction";

/** Connects the root's announcer to the `Announcer` part that is mounted, if any. */
export interface AnnouncerChannel {
  readonly announcer: CalendarAnnouncer;
  /** Speaks through `speak` with `messages` until the cleanup runs; the latest mount wins. */
  readonly mount: (
    getMessages: () => CalendarAnnouncementMessages,
    speak: (text: string) => void,
  ) => () => void;
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

/** `getEnvironment` reads the root's committed environment when an update arrives. */
export function createAnnouncerChannel(
  getEnvironment: () => Pick<CalendarEnvironmentBase, "locale" | "timeZone">,
): AnnouncerChannel {
  const mounted: MountedAnnouncer[] = [];

  function formatRange(placement: CalendarEventInterval): string {
    const { locale, timeZone } = getEnvironment();
    const format = mounted.at(-1)?.getMessages().formatRange ?? formatPlacementRange;
    return format(placement, { locale, timeZone });
  }

  return Object.freeze({
    announcer: Object.freeze({
      announce(update: CalendarInteractionUpdate) {
        const current = mounted.at(-1);
        if (current === undefined) return;
        const { locale, timeZone } = getEnvironment();
        const text = buildMessage(current.getMessages(), update, { formatRange, locale, timeZone });
        if (text !== null && text !== "") current.speak(text);
      },
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
  });
}

/** Hidden from view but read by screen readers. */
const visuallyHidden: CSSProperties = {
  border: 0,
  clipPath: "inset(50%)",
  height: 1,
  margin: -1,
  overflow: "hidden",
  padding: 0,
  position: "absolute",
  whiteSpace: "nowrap",
  width: 1,
};

/**
 * A polite live region that speaks keyboard and pointer moves, resizes, and creates in the
 * calendar's locale through `messages`. Render one inside `Root`.
 */
export function Announcer({ messages, style, ...props }: CalendarAnnouncerProps): ReactElement {
  const { announcements } = useInteractionRuntime();
  const latest = useRef(messages);
  useInsertionEffect(() => {
    latest.current = messages;
  });
  // A message that repeats the last one gets a trailing space, so the region changes and is read.
  const [spoken, setSpoken] = useState({ repeat: false, text: "" });
  useLayoutEffect(
    () =>
      announcements.mount(
        () => latest.current,
        (text) => setSpoken((last) => ({ repeat: last.text === text && !last.repeat, text })),
      ),
    [announcements],
  );

  return createElement(
    "div",
    {
      "aria-atomic": true,
      "aria-live": "polite",
      role: "status",
      ...props,
      "data-calendar-part": "announcer",
      style: { ...visuallyHidden, ...style },
    },
    spoken.repeat ? `${spoken.text}\u00a0` : spoken.text,
  );
}

/**
 * The announcer views pass to the pointer layer (`useCalendarPointer({ announcer })`), so pointer
 * gestures are spoken by the same messages and its preview labels ranges the same way.
 */
export function useCalendarAnnouncer(): CalendarAnnouncer {
  return useInteractionRuntime().announcements.announcer;
}
