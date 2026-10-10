import {
  createCanonicalEventAdapter,
  createEventSnapshot,
  type CalendarAnnouncementContext,
  type CalendarInteractionUpdate,
  type ResourceId,
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
  resourceTitle: () => undefined,
  timeZone: "UTC",
};
const update = {
  cause: "move",
  event: standup!,
  input: "pointer",
  original: standup!,
  proposed: standup!,
} as const;

function say(next: CalendarInteractionUpdate, context = where) {
  const build = calendarAnnouncements[next.phase] as (
    update: CalendarInteractionUpdate,
    context: CalendarAnnouncementContext,
  ) => string | null;
  return build(next, context)?.replace(/\s/g, " ") ?? null;
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

test("names the resources an event books when it is picked up, moved, or created", () => {
  const titles: Readonly<Record<string, string>> = {
    lotus: "Lotus",
    maya: "Maya",
    orchid: "Orchid",
  };
  const inResources = (resourceIds: readonly string[]) => ({ ...standup!, resourceIds });
  const booked = { ...update, original: inResources(["orchid", "maya"]) };
  const titled = { ...where, resourceTitle: (id: ResourceId) => titles[id] };

  expect(say({ ...booked, phase: "start", proposed: booked.original }, titled)).toBe(
    "Picked up standup, Thursday, October 8, 9:00 – 9:30 AM, Orchid, Maya.",
  );
  // A step names the resources when they change from the step before; unknown IDs are left out.
  const step = (resourceIds: readonly string[]) =>
    say({ ...booked, phase: "step", proposed: inResources(resourceIds) }, titled);
  expect(step(["orchid", "maya"])).toBe("Thursday, October 8, 9:00 – 9:30 AM");
  expect(step(["lotus", "maya", "gone"])).toBe("Thursday, October 8, 9:00 – 9:30 AM, Lotus, Maya");
  expect(step(["lotus", "maya", "gone"])).toBe("Thursday, October 8, 9:00 – 9:30 AM");
  expect(step(["orchid", "maya"])).toBe("Thursday, October 8, 9:00 – 9:30 AM, Orchid, Maya");

  // A drag that starts off the view names nothing, so its first step names the resource.
  const offView = { ...update, original: inResources(["orchid"]) };
  expect(say({ ...offView, phase: "start", proposed: null }, titled)).toBe("Picked up standup.");
  expect(say({ ...offView, phase: "step", proposed: inResources(["orchid"]) }, titled)).toBe(
    "Thursday, October 8, 9:00 – 9:30 AM, Orchid",
  );

  // A resize keeps its resources, so it never names them, even after starting off the view.
  const resizing = { ...offView, cause: "resize-end", original: inResources(["orchid"]) } as const;
  expect(say({ ...resizing, phase: "start", proposed: null }, titled)).toBe(
    "Resizing the end of standup.",
  );
  expect(say({ ...resizing, phase: "step", proposed: inResources(["orchid"]) }, titled)).toBe(
    "Thursday, October 8, 9:00 – 9:30 AM",
  );

  // A drag that starts over another resource announces it, so going back names the original.
  const dragged = { ...update, original: inResources(["orchid"]) };
  expect(say({ ...dragged, phase: "start", proposed: inResources(["lotus"]) }, titled)).toBe(
    "Picked up standup, Thursday, October 8, 9:00 – 9:30 AM, Lotus.",
  );
  expect(say({ ...dragged, phase: "step", proposed: inResources(["orchid"]) }, titled)).toBe(
    "Thursday, October 8, 9:00 – 9:30 AM, Orchid",
  );
  expect(
    say({ ...booked, phase: "commit", proposed: inResources(["lotus", "maya"]) }, titled),
  ).toBe("Moved standup to Thursday, October 8, 9:00 – 9:30 AM, Lotus, Maya.");
  expect(
    say(
      {
        ...booked,
        cause: "create",
        event: null,
        original: null,
        phase: "commit",
        proposed: inResources(["lotus"]),
      },
      titled,
    ),
  ).toBe("New event for Thursday, October 8, 9:00 – 9:30 AM, Lotus.");
  expect(
    say({ ...booked, cause: "resize-end", phase: "commit", proposed: booked.original }, titled),
  ).toBe("standup now runs Thursday, October 8, 9:00 – 9:30 AM.");
});
