// @vitest-environment jsdom

import {
  conflictPolicy,
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEventChange,
  type CalendarFocus,
  type CalendarResource,
} from "@moltenship/calendar";
import { act } from "react";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { calendarAnnouncements } from "../calendar/announcements";
import { createResourceColumnsView } from "../resource-columns-view/resource-columns-view";
import { layOut, pointer } from "./pointer";
import { render } from "./render";
import { shift, type StaffEvent } from "./resource-fixtures";
import { anchorDate, text } from "./view-fixtures";

type Space = CalendarResource<{ readonly kind: "person" | "room" }>;
type Change = CalendarEventChange<StaffEvent, string, string>;

const Calendar = createCalendar<StaffEvent, Space>()({
  eventAdapter: createCanonicalEventAdapter<null, string, string>(),
  views: [createResourceColumnsView<StaffEvent, Space>()],
});
const spaces: readonly Space[] = [
  { data: { kind: "room" }, id: "orchid", title: "Orchid" },
  { data: { kind: "person" }, id: "ada", title: "Ada" },
];
const rooms = new Set(spaces.filter(({ data }) => data.kind === "room").map(({ id }) => id));
/** Rooms can't be double-booked; people can, with a warning. */
const policies = [
  conflictPolicy<StaffEvent, string, string>({
    getResourceMode: (resourceId) => (rooms.has(resourceId) ? "block" : undefined),
    mode: "warn",
  }),
];
/**
 * Orchid and Ada are both busy with the standup at 09:00; each has an 11:00 booking to move, and
 * they share a lunch.
 */
const events = [
  shift("standup", ["orchid", "ada"], "2026-10-08T09:00Z", "2026-10-08T09:30Z"),
  shift("interview", ["orchid"], "2026-10-08T11:00Z", "2026-10-08T11:30Z"),
  shift("coffee", ["ada"], "2026-10-08T11:00Z", "2026-10-08T11:30Z"),
  shift("lunch", ["orchid", "ada"], "2026-10-08T12:00Z", "2026-10-08T12:30Z"),
];

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

async function renderSpaces(defaultFocus: CalendarFocus | null = null) {
  const onEventChange = vi.fn<(change: Change) => void>();
  const view = await render(
    <Calendar.Root
      defaultAnchorDate={anchorDate}
      defaultFocus={defaultFocus}
      defaultTimeZone="UTC"
      defaultView="resources"
      events={events}
      locale="en-US"
      now={Temporal.Instant.from("2026-10-08T12:00Z")}
      onEventChange={onEventChange}
      policies={policies}
      resources={spaces}
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <Calendar.ActiveView />
      <Calendar.Announcer messages={calendarAnnouncements} />
    </Calendar.Root>,
  );
  cleanup = view.unmount;
  const { container } = view;
  return {
    container,
    onEventChange,
    spoken: () => text(container.querySelector('[data-calendar-part="announcer"]'))?.trim(),
  };
}

async function press(key: string) {
  await act(async () => {
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }),
    );
  });
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve));
  });
}

/** What the app received: each change's cause, placement and warnings. */
function outcome(calls: readonly (readonly [Change])[]) {
  return calls.map(([change]) => ({
    cause: change.cause,
    end: change.proposed?.end.toString(),
    kind: change.proposed?.kind,
    resourceIds: change.proposed?.resourceIds,
    start: change.proposed?.start.toString(),
    warnings: change.warnings,
  }));
}

/** The other preview mark, which must not show beside the expected one. */
const otherMark = (mark: string) => (mark === "data-invalid" ? "data-warning" : "data-invalid");

const cases = [
  {
    changes: [],
    eventId: "interview",
    preview: "data-invalid",
    resourceId: "orchid",
    spoken: "interview would double-book a room or person, so it's back where it was.",
  },
  {
    changes: [
      {
        cause: "move",
        end: "2026-10-08T09:30:00Z",
        kind: "timed",
        resourceIds: ["ada"],
        start: "2026-10-08T09:00:00Z",
        warnings: ["resource-conflict"],
      },
    ],
    eventId: "coffee",
    preview: "data-warning",
    resourceId: "ada",
    spoken: "Moved coffee to Thursday, October 8, 9:00 – 9:30 AM, Ada, double-booked.",
  },
] as const;

describe.each(cases)(
  "moving $eventId onto the standup in $resourceId",
  ({ changes, eventId, preview, resourceId, spoken: said }) => {
    test("the keyboard previews the room's block or the person's warning, then ends so", async () => {
      const { container, onEventChange, spoken } = await renderSpaces({
        date: anchorDate,
        eventId,
        kind: "event",
        resourceId,
      });
      const chip = () =>
        container.querySelector<HTMLElement>(
          `[data-event-id="${eventId}"]:not([data-calendar-ghost])`,
        )!;
      await act(async () =>
        container.querySelector<HTMLElement>('[role="grid"] [tabindex="0"]')!.focus(),
      );
      await press(" ");
      // Eight quarter hours earlier: 09:00, over the standup.
      for (let step = 0; step < 8; step += 1) await press("ArrowUp");
      expect(chip().hasAttribute(preview)).toBe(true);
      expect(chip().hasAttribute(otherMark(preview))).toBe(false);
      await press("Enter");
      await settle();

      expect(outcome(onEventChange.mock.calls)).toEqual(changes);
      expect(spoken()).toBe(said);
    });

    test("a pointer drag previews and ends the same as the keyboard", async () => {
      const { container, onEventChange, spoken } = await renderSpaces();
      // 100px columns, Orchid's then Ada's, 30px an hour below a 100px header, so the ghost stays
      // inside jsdom's 1024×768 viewport.
      const x = resourceId === "orchid" ? 50 : 150;
      const hour = (hours: number) => 100 + hours * 30;
      const event = container.querySelector(`[data-event-id="${eventId}"]`)!;
      const columns = [
        ...container.querySelectorAll('[data-slot="resource-columns-body"] [data-date]'),
      ];
      layOut([
        [event, { height: 15, width: 100, x: x - 50, y: hour(11) }],
        ...columns.map(
          (column, index) => [column, { height: 720, width: 100, x: index * 100, y: 100 }] as const,
        ),
      ]);
      const ghost = () => document.querySelector("[data-calendar-ghost]");

      act(() => {
        pointer(event, "pointerdown", [x, hour(11.1)]);
        pointer(event, "pointermove", [x, hour(10.1)]);
      });
      expect(ghost()?.hasAttribute(preview)).toBe(false);
      act(() => pointer(event, "pointermove", [x, hour(9.1)]));
      expect(ghost()?.hasAttribute(preview)).toBe(true);
      expect(ghost()?.hasAttribute(otherMark(preview))).toBe(false);
      act(() => pointer(event, "pointerup", [x, hour(9.1)]));
      await settle();

      expect(outcome(onEventChange.mock.calls)).toEqual(changes);
      expect(spoken()).toBe(said);
    });
  },
);

test("a booking moved from a room to a busy person is only warned about", async () => {
  const { container, onEventChange } = await renderSpaces({
    date: anchorDate,
    eventId: "interview",
    kind: "event",
    resourceId: "orchid",
  });
  await act(async () =>
    container.querySelector<HTMLElement>('[role="grid"] [tabindex="0"]')!.focus(),
  );
  await press(" ");
  // Into Ada's column, then up onto the standup.
  await press("ArrowRight");
  for (let step = 0; step < 8; step += 1) await press("ArrowUp");
  await press("Enter");
  await settle();

  expect(outcome(onEventChange.mock.calls)).toEqual([
    {
      cause: "move",
      end: "2026-10-08T09:30:00Z",
      kind: "timed",
      resourceIds: ["ada"],
      start: "2026-10-08T09:00:00Z",
      warnings: ["resource-conflict"],
    },
  ]);
});

test("a booking of a busy room and a busy person previews the room's block, and isn't saved", async () => {
  const { container, onEventChange } = await renderSpaces({
    date: anchorDate,
    eventId: "lunch",
    kind: "event",
    resourceId: "orchid",
  });
  const chip = () =>
    container.querySelector<HTMLElement>(
      '[data-resource-id="orchid"] [data-event-id="lunch"]:not([data-calendar-ghost])',
    )!;
  await act(async () =>
    container.querySelector<HTMLElement>('[role="grid"] [tabindex="0"]')!.focus(),
  );
  await press(" ");
  // Twelve quarter hours earlier: 09:00, when the standup has both Orchid and Ada.
  for (let step = 0; step < 12; step += 1) await press("ArrowUp");
  expect([chip().hasAttribute("data-invalid"), chip().hasAttribute("data-warning")]).toEqual([
    true,
    false,
  ]);
  await press("Enter");
  await settle();

  expect(onEventChange).not.toHaveBeenCalled();
});
