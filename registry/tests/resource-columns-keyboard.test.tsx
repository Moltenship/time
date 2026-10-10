// @vitest-environment jsdom

import type { CalendarEventChange, CalendarFocus, CalendarResource } from "@moltenship/calendar";
import { act } from "react";
import { afterEach, expect, test, vi } from "vite-plus/test";

import { calendarAnnouncements } from "../calendar/announcements";
import { drag, layOut, pointer } from "./pointer";
import { render } from "./render";
import { people, ResourceCalendar, shift, type StaffEvent } from "./resource-fixtures";
import { ariaLabel, text } from "./view-fixtures";

type Change = CalendarEventChange<StaffEvent, string, string>;

const anchorDate = Temporal.PlainDate.from("2026-10-08");
const standup = shift("standup", ["p1"], "2026-10-08T09:00Z", "2026-10-08T09:30Z");

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

async function renderResources({
  defaultFocus = null,
  direction,
  events = [standup],
  onEventChange = () => {},
  resources = people(3),
  unassigned = "hide",
}: {
  readonly defaultFocus?: CalendarFocus | null;
  readonly direction?: "ltr" | "rtl";
  readonly events?: readonly StaffEvent[];
  readonly unassigned?: "bucket" | "hide";
  readonly onEventChange?: (change: Change) => void;
  readonly resources?: readonly CalendarResource<null>[];
} = {}) {
  const view = await render(
    <ResourceCalendar.Root
      defaultAnchorDate={anchorDate}
      defaultFocus={defaultFocus}
      defaultTimeZone="UTC"
      defaultView="resources"
      direction={direction}
      events={events}
      locale="en-US"
      now={Temporal.Instant.from("2026-10-08T12:00Z")}
      onEventChange={onEventChange}
      resources={resources}
      viewOptions={{ resources: { unassigned } }}
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <ResourceCalendar.ActiveView />
      <ResourceCalendar.Announcer messages={calendarAnnouncements} />
    </ResourceCalendar.Root>,
  );
  cleanup = view.unmount;
  return view.container;
}

async function press(key: string) {
  await act(async () => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }),
    );
    await Promise.resolve();
  });
}

/** Focuses the view's tab stop, as Tab would. */
async function tabIn(container: HTMLElement) {
  await act(async () =>
    container.querySelector<HTMLElement>('[role="grid"] [tabindex="0"]')!.focus(),
  );
}

const focused = () => ariaLabel(document.activeElement);
const focusedResource = () =>
  document.activeElement?.closest("[data-resource-id]")?.getAttribute("data-resource-id");
const spoken = (container: HTMLElement) =>
  text(container.querySelector('[data-calendar-part="announcer"]'))?.trim();

test("arrow keys cross resource columns, and past the last resource page to the next day", async () => {
  const container = await renderResources();
  const stops = container.querySelectorAll('[role="grid"] [tabindex="0"]');

  expect([...stops].map(ariaLabel)).toEqual([
    "Person 1, Thursday, October 8, 2026, no all-day events",
  ]);

  await tabIn(container);
  await press("ArrowDown");
  expect(focused()).toBe("Person 1, Thursday, October 8 at 12:00 AM");
  await press("ArrowRight");
  expect([focused(), focusedResource()]).toEqual([
    "Person 2, Thursday, October 8 at 12:00 AM",
    "p2",
  ]);
  await press("End");
  expect(focusedResource()).toBe("p3");
  await press("Home");
  expect(focusedResource()).toBe("p1");
  await press("ArrowUp");
  expect(focused()).toBe("Person 1, Thursday, October 8, 2026, no all-day events");

  await press("End");
  await press("ArrowRight");
  expect(ariaLabel(container.querySelector('[role="grid"]'))).toBe("October 9, 2026");
  expect([focused(), focusedResource()]).toEqual([
    "Person 1, Friday, October 9, 2026, no all-day events",
    "p1",
  ]);
});

test("in RTL, the arrow keys follow the layout: left is the next resource", async () => {
  const container = await renderResources({ direction: "rtl" });
  await tabIn(container);
  await press("ArrowDown");

  await press("ArrowLeft");
  expect(focusedResource()).toBe("p2");
  await press("ArrowRight");
  expect(focusedResource()).toBe("p1");
});

test("End reaches a resource scrolled out of view and focuses its column", async () => {
  const container = await renderResources({ resources: people(200) });
  const rendered = () =>
    [...container.querySelectorAll('[data-slot="resource-columns-body"] [data-resource-id]')].map(
      (column) => column.getAttribute("data-resource-id"),
    );

  await tabIn(container);
  await press("ArrowDown");
  await press("End");

  expect([focused(), focusedResource()]).toEqual([
    "Person 200, Thursday, October 8 at 12:00 AM",
    "p200",
  ]);
  // The focused column renders beside the ones in view, so focus never waits for a scroll.
  expect(rendered()).toContain("p200");
  expect(rendered()).toHaveLength(11);
});

/** Lays out 100px resource columns, 100px an hour from midnight, with standup in the first. */
function layOutColumns(container: HTMLElement) {
  const columns = [
    ...container.querySelectorAll('[data-slot="resource-columns-body"] [data-date]'),
  ];
  const event = container.querySelector('[data-event-id="standup"]')!;
  layOut([
    [event, { height: 50, width: 100, x: 0, y: 900 }],
    ...columns.map(
      (column, index) => [column, { height: 2400, width: 100, x: index * 100, y: 0 }] as const,
    ),
  ]);
  return event;
}

test("a drag that starts over another resource names the original one on its way back", async () => {
  const container = await renderResources();
  const event = layOutColumns(container);

  await act(async () => {
    pointer(event, "pointerdown", [50, 910]);
    pointer(event, "pointermove", [150, 910]);
  });
  expect(spoken(container)).toBe(
    "Picked up standup, Thursday, October 8, 9:00 – 9:30 AM, Person 2.",
  );
  await act(async () => pointer(event, "pointermove", [50, 910]));
  expect(spoken(container)).toBe("Thursday, October 8, 9:00 – 9:30 AM, Person 1");
  await act(async () => pointer(event, "pointerup", [50, 910]));
});

test("moving an event to another resource from the keyboard gives the pointer's change", async () => {
  const pointerChange = vi.fn<(change: Change) => void>();
  const event = layOutColumns(await renderResources({ onEventChange: pointerChange }));
  drag(event, [
    [50, 910],
    [150, 910],
  ]);
  await cleanup?.();

  const keyboardChange = vi.fn<(change: Change) => void>();
  const container = await renderResources({
    defaultFocus: { date: anchorDate, eventId: "standup", kind: "event", resourceId: "p1" },
    onEventChange: keyboardChange,
  });
  await tabIn(container);
  await press(" ");
  expect(spoken(container)).toMatch(
    /^Picked up standup, Thursday, October 8, 9:00 – 9:30 AM, Person 1\./,
  );
  await press("ArrowRight");
  expect(spoken(container)).toBe("Thursday, October 8, 9:00 – 9:30 AM, Person 2");
  // Out to Person 2 and back names both; a step that keeps the resource names none.
  await press("ArrowLeft");
  expect(spoken(container)).toBe("Thursday, October 8, 9:00 – 9:30 AM, Person 1");
  await press("ArrowRight");
  await press("ArrowDown");
  expect(spoken(container)).toBe("Thursday, October 8, 9:15 – 9:45 AM");
  await press("ArrowUp");
  await press("Enter");

  const fromPointer = pointerChange.mock.calls[0]![0];
  const fromKeyboard = keyboardChange.mock.calls[0]![0];
  expect(fromKeyboard.cause).toBe("move");
  expect(fromKeyboard.proposed).toEqual(fromPointer.proposed);
  expect(fromKeyboard.proposed?.resourceIds).toEqual(["p2"]);
  expect(spoken(container)).toBe("Moved standup to Thursday, October 8, 9:00 – 9:30 AM, Person 2.");
});

test("an event moved out of its last resource keeps focus where it still shows", async () => {
  // Unassigned follows p2: moving the p2 copy there unbooks p2, so the event shows only in p1.
  // "gone" isn't a resource of the calendar, so it has no column to take focus.
  const container = await renderResources({
    defaultFocus: { date: anchorDate, eventId: "standup", kind: "event", resourceId: "p2" },
    events: [shift("standup", ["gone", "p1", "p2"], "2026-10-08T09:00Z", "2026-10-08T09:30Z")],
    resources: people(2),
    unassigned: "bucket",
  });
  await tabIn(container);
  await press(" ");
  await press("ArrowRight");

  const onStandup = () => [
    document.activeElement?.getAttribute("data-event-id"),
    document.activeElement?.hasAttribute("data-grabbed"),
    focusedResource(),
  ];
  expect(onStandup()).toEqual(["standup", true, "p1"]);
  // Later steps stay on that copy.
  await press("ArrowDown");
  expect(onStandup()).toEqual(["standup", true, "p1"]);
});

test("an event moved out of its last resource keeps focus on a copy scrolled out of view", async () => {
  // Unassigned follows p200, and the event's other copy, in p100, is far out of view.
  const container = await renderResources({
    defaultFocus: { date: anchorDate, eventId: "standup", kind: "event", resourceId: "p200" },
    events: [shift("standup", ["p100", "p200"], "2026-10-08T09:00Z", "2026-10-08T09:30Z")],
    resources: people(200),
    unassigned: "bucket",
  });
  await tabIn(container);
  await press(" ");
  await press("ArrowRight");

  expect([
    document.activeElement?.getAttribute("data-event-id"),
    document.activeElement?.hasAttribute("data-grabbed"),
    focusedResource(),
  ]).toEqual(["standup", true, "p100"]);
  // Saving keeps focus on that copy too.
  await press("Enter");
  expect([document.activeElement?.getAttribute("data-event-id"), focusedResource()]).toEqual([
    "standup",
    "p100",
  ]);
});

test("a save that finishes after the resources change keeps focus on a copy that still shows", async () => {
  let save!: () => void;
  const onEventChange = () => new Promise<void>((resolve) => (save = resolve));
  const calendar = (resources: readonly CalendarResource<null>[]) => (
    <ResourceCalendar.Root
      defaultAnchorDate={anchorDate}
      defaultFocus={{ date: anchorDate, eventId: "standup", kind: "event", resourceId: "p3" }}
      defaultTimeZone="UTC"
      defaultView="resources"
      events={[shift("standup", ["p1", "p2", "p3"], "2026-10-08T09:00Z", "2026-10-08T09:30Z")]}
      locale="en-US"
      onEventChange={onEventChange}
      resources={resources}
      viewOptions={{ resources: { unassigned: "bucket" } }}
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <ResourceCalendar.ActiveView />
    </ResourceCalendar.Root>
  );
  const view = await render(calendar(people(3)));
  cleanup = view.unmount;
  await tabIn(view.container);
  await press(" ");
  // Into Unassigned: the move unbooks p3, so focus follows the event to p1.
  await press("ArrowRight");
  await press("Enter");

  // While saving, p1 moves into a collapsed group, so only the p2 copy still shows.
  await view.rerender(
    calendar([
      { data: null, id: "group", title: "Group" },
      { data: null, id: "p1", parentId: "group", title: "Person 1" },
      ...people(3).slice(1),
    ]),
  );
  await act(async () => save());

  expect([document.activeElement?.getAttribute("data-event-id"), focusedResource()]).toEqual([
    "standup",
    "p2",
  ]);
});
