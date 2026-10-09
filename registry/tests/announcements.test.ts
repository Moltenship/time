import {
  createCanonicalEventAdapter,
  createEventSnapshot,
  type CalendarAnnouncementContext,
  type CalendarInteractionUpdate,
} from "@moltenship/calendar";
import { expect, test } from "vite-plus/test";

import { calendarAnnouncements } from "../calendar/announcements";
import { timed } from "./view-fixtures";

const [standup] = createEventSnapshot(
  [timed("standup", "2026-10-08T09:00Z", "2026-10-08T09:30Z")],
  createCanonicalEventAdapter(),
).events;
const where: CalendarAnnouncementContext = {
  formatRange: () => "",
  locale: "en-US",
  timeZone: "UTC",
};
const update = {
  cause: "move",
  event: standup!,
  input: "pointer",
  original: standup!,
  proposed: standup!,
} as const;

function say(next: CalendarInteractionUpdate) {
  const build = calendarAnnouncements[next.phase] as (
    update: CalendarInteractionUpdate,
    context: CalendarAnnouncementContext,
  ) => string | null;
  return build(next, where)?.replace(/\s/g, " ") ?? null;
}

test("leaves keyboard hints out of pointer gestures", () => {
  expect(say({ ...update, phase: "start" })).toBe(
    "Picked up standup, Thursday, October 8, 9:00 – 9:30 AM.",
  );
  expect(say({ ...update, cause: "resize-start", input: "keyboard", phase: "start" })).toBe(
    "Resizing the start of standup, Thursday, October 8, 9:00 – 9:30 AM. Use the arrow keys to change its start, Shift+Space to change its end instead, then Enter to finish or Escape to cancel.",
  );
});

test("explains rejections, and says nothing when a newer change replaced this one", () => {
  expect(say({ ...update, phase: "reject", reason: "read-only" })).toBe(
    "standup is read-only and can't be changed.",
  );
  expect(say({ ...update, phase: "reject", reason: "out-of-bounds" })).toBe(
    "standup can't go there, so it's back where it was.",
  );
  expect(say({ ...update, phase: "reject", reason: "handler-error" })).toBe(
    "Couldn't save standup, so it's back where it was.",
  );
  expect(say({ ...update, phase: "reject", reason: "superseded" })).toBeNull();
  expect(say({ ...update, cause: "create", event: null, phase: "cancel" })).toBe(
    "Cancelled the new event.",
  );
});
