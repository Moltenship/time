import type { CalendarAnnouncer } from "@moltenship/calendar-core";
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

export { createAnnouncerChannel } from "@moltenship/calendar-primitives";
export type { AnnouncerChannel } from "@moltenship/calendar-primitives";

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
