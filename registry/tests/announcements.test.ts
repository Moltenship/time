import {
  createCanonicalEventAdapter,
  createEventSnapshot,
  eventPlacement,
  type CalendarAnnouncementContext,
  type CalendarInteractionUpdate,
  type EventHistoryOutcome,
  type EventHistoryStep,
  type EventId,
  type ResourceId,
} from "@moltenship/calendar";
import { expect, test } from "vite-plus/test";

import { calendarAnnouncements, calendarHistoryAnnouncements } from "../calendar/announcements";
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

test("names an item dragged in from outside, with no keyboard hints of the calendar's", () => {
  const dropped = {
    ...update,
    cause: "create",
    event: null,
    input: "keyboard",
    original: null,
    outside: { title: "Write report" },
  } as const;
  expect(say({ ...dropped, phase: "start" })).toBe(
    "Write report, Thursday, October 8, 9:00 – 9:30 AM.",
  );
  expect(say({ ...dropped, phase: "commit" })).toBe(
    "Added Write report for Thursday, October 8, 9:00 – 9:30 AM.",
  );
  expect(say({ ...dropped, phase: "cancel" })).toBe("Cancelled. Write report wasn't added.");
  expect(say({ ...dropped, phase: "reject", reason: "handler-error" })).toBe(
    "Couldn't save Write report, so it's back where it was.",
  );
  // Without a title it's a new event, and an event of the calendar's keeps its own name.
  expect(say({ ...dropped, outside: {}, phase: "start" })).toBe(
    "New event, Thursday, October 8, 9:00 – 9:30 AM.",
  );
  expect(say({ ...update, input: "keyboard", outside: {}, phase: "start" })).toBe(
    "standup, Thursday, October 8, 9:00 – 9:30 AM.",
  );
});

test("names the resource an item dragged in moves to, and not again until it changes", () => {
  const titles: Readonly<Record<string, string>> = { lotus: "Lotus", orchid: "Orchid" };
  const rooms = { ...where, resourceTitle: (id: ResourceId) => titles[String(id)] };
  const at = (resourceIds: readonly string[]) => ({ ...standup!, resourceIds });
  const dropped = {
    cause: "create",
    event: null,
    input: "pointer",
    original: null,
    outside: { title: "Write report" },
  } as const;

  expect(say({ ...dropped, phase: "start", proposed: at(["lotus"]) }, rooms)).toBe(
    "Write report, Thursday, October 8, 9:00 – 9:30 AM, Lotus.",
  );
  expect(say({ ...dropped, phase: "step", proposed: at(["lotus"]) }, rooms)).toBe(
    "Thursday, October 8, 9:00 – 9:30 AM",
  );
  expect(say({ ...dropped, phase: "step", proposed: at(["orchid"]) }, rooms)).toBe(
    "Thursday, October 8, 9:00 – 9:30 AM, Orchid",
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
  // The application cancelled it, as when the user dismisses the recurrence scope question.
  const cancelled = new DOMException("Cancelled", "AbortError");
  expect(say({ ...update, error: cancelled, phase: "reject", reason: "handler-error" })).toBe(
    "Cancelled. standup is back where it was.",
  );
  expect(
    say({ ...update, error: new Error("offline"), phase: "reject", reason: "handler-error" }),
  ).toBe("Couldn't save standup, so it's back where it was.");
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

test("says when the policies would reject or flag a placement for falling outside working hours", () => {
  const change = { ...update, id: "check", warnings: ["outside-availability"] } as never;
  const blocked = { change, reason: "outside-availability", status: "rejected" } as const;
  const warned = { change, status: "accepted" } as const;
  const time = "Thursday, October 8, 9:00 – 9:30 AM";

  expect(say({ ...update, check: blocked, phase: "step" })).toBe(`${time}, outside working hours`);
  expect(say({ ...update, check: warned, phase: "step" })).toBe(`${time}, outside working hours`);
  expect(say({ ...update, check: { ...blocked, reason: "custom" }, phase: "step" })).toBe(
    `${time}, can't go here`,
  );
  expect(say({ ...update, check: null, phase: "step" })).toBe(time);
  expect(
    say({
      ...update,
      cause: "create",
      check: blocked,
      event: null,
      original: null,
      phase: "start",
    }),
  ).toBe(`New event, ${time}, outside working hours.`);

  expect(say({ ...update, phase: "commit", warnings: ["outside-availability"] })).toBe(
    `Moved standup to ${time}, outside working hours.`,
  );
  expect(say({ ...update, phase: "reject", reason: "outside-availability" })).toBe(
    "standup can't go outside working hours, so it's back where it was.",
  );
  expect(
    say({
      ...update,
      cause: "create",
      event: null,
      phase: "reject",
      reason: "outside-availability",
    }),
  ).toBe("Can't create an event outside working hours.");
});

test("says how an undo or redo went, and where the event is now", () => {
  type Outcome = EventHistoryOutcome<unknown, EventId, ResourceId>;
  const placement = eventPlacement(standup!);
  const step = (
    cause: EventHistoryStep<unknown, EventId, ResourceId>["cause"],
    before = placement,
    after = placement,
  ) =>
    ({
      after,
      before,
      cause,
      changes: [],
      event: null,
      eventId: "standup",
      id: "step-1",
      input: "pointer",
    }) as EventHistoryStep<unknown, EventId, ResourceId>;
  const committed = (
    direction: "undo" | "redo",
    cause: Parameters<typeof step>[0],
    before = placement,
    after = placement,
  ): Outcome => ({
    direction,
    result: { change: null as never, status: "committed" },
    status: "committed",
    step: step(cause, before, after),
  });
  // `shown` is false for an event the calendar doesn't show, such as one restored a moment ago.
  const say = (outcome: Outcome, shown = true) =>
    calendarHistoryAnnouncements[outcome.direction](outcome, {
      ...where,
      event: shown ? standup : undefined,
    })?.replace(/\s/g, " ") ?? null;

  expect(say(committed("undo", "move"))).toBe(
    "Undid the move: standup is back at Thursday, October 8, 9:00 – 9:30 AM.",
  );
  expect(say(committed("redo", "move"))).toBe(
    "Moved standup to Thursday, October 8, 9:00 – 9:30 AM again.",
  );
  expect(say(committed("undo", "resize-end"))).toBe(
    "Undid the resize: standup runs Thursday, October 8, 9:00 – 9:30 AM.",
  );
  // A restored event the calendar doesn't show yet is "the event".
  expect(say(committed("undo", "delete", placement, null as never), false)).toBe(
    "Restored the event, Thursday, October 8, 9:00 – 9:30 AM.",
  );
  expect(say(committed("redo", "delete", placement, null as never))).toBe("Deleted standup again.");
  expect(say(committed("undo", "create", null as never))).toBe("Undid creating standup.");

  expect(say({ direction: "undo", status: "empty" })).toBe("Nothing to undo.");
  expect(say({ direction: "redo", status: "stale", step: step("move") })).toBe(
    "Can't redo that: standup has changed since.",
  );
  const rejected = (reason: string, error?: unknown): Outcome => ({
    direction: "undo",
    result: { error, reason, status: "rejected" },
    status: "rejected",
    step: step("move"),
  });
  expect(say(rejected("resource-conflict"))).toBe(
    "Couldn't undo: standup would double-book someone.",
  );
  expect(say(rejected("handler-error"))).toBe("Couldn't undo the change to standup.");
  expect(say(rejected("handler-error", new DOMException("Cancelled", "AbortError")))).toBe(
    "Cancelled the undo.",
  );
  expect(say(rejected("superseded"))).toBeNull();
});
