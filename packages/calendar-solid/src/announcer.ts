import type { CalendarAnnouncer } from "@moltenship/calendar-core";
import { createAnnouncerLiveText } from "@moltenship/calendar-primitives";
import { createComponent, isServer, type JSX } from "@solidjs/web";
import { createRenderEffect, merge, omit, untrack } from "solid-js";

import { element } from "./props";
import { useInteractionNow } from "./shared";
import { createStateSelector } from "./state-selector";
import type { CalendarAnnouncerProps } from "./types";

/** Hidden from view but read by screen readers. */
const visuallyHidden: JSX.CSSProperties = {
  border: "0",
  "clip-path": "inset(50%)",
  height: "1px",
  margin: "-1px",
  overflow: "hidden",
  padding: "0",
  position: "absolute",
  "white-space": "nowrap",
  width: "1px",
};

const visuallyHiddenText = Object.entries(visuallyHidden)
  .map(([name, value]) => `${name}:${String(value)}`)
  .join(";");

const same = <T>(value: T) => value;
const Div = element("div");

/**
 * A polite live region that speaks keyboard and pointer moves, resizes, and creates in the
 * calendar's locale through `messages`. Render one inside `Root`. `messages` is read when
 * something is said, so a new set takes effect at once.
 */
export function Announcer(props: CalendarAnnouncerProps): JSX.Element {
  const { announcements } = useInteractionNow();
  const live = createAnnouncerLiveText();
  const spoken = createStateSelector(live, same);
  // Mounted once the region renders; the cleanup lets the channel go with it.
  createRenderEffect(
    () => announcements,
    (channel) =>
      isServer ? undefined : channel.mount(() => untrack(() => props.messages), live.speak),
  );

  const own = {
    "aria-atomic": "true",
    "aria-live": "polite",
    role: "status",
  } as const;
  const fixed = {
    get children() {
      return spoken();
    },
    "data-calendar-part": "announcer",
    get style() {
      const { style } = props;
      if (style === undefined) return visuallyHidden;
      return typeof style === "string"
        ? `${visuallyHiddenText};${style}`
        : { ...visuallyHidden, ...style };
    },
  };
  return createComponent(
    Div,
    merge(own, omit(props, "messages", "style"), fixed) as JSX.IntrinsicElements["div"],
  );
}

/**
 * The announcer views pass to the pointer layer (`useCalendarPointer({ announcer })`), so pointer
 * gestures are spoken by the same messages and its preview labels ranges the same way. The same
 * object for the root's lifetime.
 */
export function useCalendarAnnouncer(): CalendarAnnouncer {
  return useInteractionNow().announcements.announcer;
}
