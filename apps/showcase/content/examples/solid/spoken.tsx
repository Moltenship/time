// Accessibility's calendar with its announcements in view: the Month page's calendar, and the
// `Announcer` shown under it instead of hidden.

// #region spoken
import type { JSX } from "@solidjs/web";
import { createSignal } from "solid-js";

import { calendarAnnouncements } from "@/components/calendar/announcements";

import { applyChange, seed } from "./month-events";
import { Calendar } from "./month-page";

// The announcer hides itself from view. These put it back, to show what a screen reader hears.
const shown: JSX.CSSProperties = {
  "clip-path": "none",
  height: "auto",
  margin: "0",
  position: "static",
  "white-space": "normal",
  width: "auto",
};

/** What the calendar says, under it. Inside `Calendar.Root`. */
export function Spoken() {
  return (
    <div class="flex min-h-11 shrink-0 items-center gap-3 border-t px-4 py-2 text-sm">
      <span class="shrink-0 text-xs font-medium text-muted-foreground uppercase">
        Screen reader
      </span>
      <Calendar.Announcer messages={calendarAnnouncements} style={shown} />
    </div>
  );
}

export default function SpokenPage() {
  const [events, setEvents] = createSignal(seed);
  return (
    <Calendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="UTC"
      defaultView="month"
      events={events()}
      locale="en-US"
      onEventChange={(change) => {
        setEvents((current) => applyChange(current, change));
      }}
      weekRules={{ firstDay: 7, minimalDays: 1, weekend: [6, 7] }}
    >
      <Calendar.Frame class="flex h-dvh flex-col">
        <Calendar.Viewport class="min-h-0 flex-1">
          <Calendar.ActiveView />
        </Calendar.Viewport>
        <Spoken />
      </Calendar.Frame>
    </Calendar.Root>
  );
}
// #endregion spoken
