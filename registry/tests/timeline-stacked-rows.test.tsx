// @vitest-environment jsdom

import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarFocus,
  type CalendarResource,
} from "@moltenship/calendar";
import { act } from "react";
import { afterEach, beforeAll, expect, test, vi } from "vite-plus/test";

import { calendarAnnouncements } from "../calendar/announcements";
import { createTimelineDayView } from "../resource-timeline-view/resource-timeline-view";
import { drag, layOut } from "./pointer";
import { render } from "./render";
import {
  booking,
  dayTarget,
  row,
  StubResizeObserver,
  type Booking,
  type BookingChange,
} from "./timeline-fixtures";

type Space = CalendarResource<{ readonly kind: "person" | "room" }>;

const Calendar = createCalendar<Booking, Space>()({
  eventAdapter: createCanonicalEventAdapter<null, string, string>(),
  views: [
    createTimelineDayView<Booking, Space>({
      // Rooms stack their bookings; people keep a lane per level of overlap.
      getResourceOverlapLayout: (resource) => (resource.data.kind === "room" ? "stack" : undefined),
    }),
  ],
});
const spaces: readonly Space[] = [
  { data: { kind: "room" }, id: "orchid", title: "Orchid" },
  { data: { kind: "person" }, id: "ada", title: "Ada" },
];
const events = [
  booking("standup", ["orchid", "ada"], "2026-10-08T09:00Z", "2026-10-08T10:00Z"),
  booking("review", ["orchid", "ada"], "2026-10-08T09:30Z", "2026-10-08T10:30Z"),
  booking("interview", ["orchid"], "2026-10-08T09:45Z", "2026-10-08T10:15Z"),
];

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
});

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

async function show(
  onEventChange?: (change: BookingChange) => void,
  defaultFocus: CalendarFocus | null = null,
) {
  const view = await render(
    <Calendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultFocus={defaultFocus}
      defaultTimeZone="UTC"
      defaultView="timeline-day"
      events={events}
      locale="en-US"
      now={Temporal.Instant.from("2026-10-08T12:00:00Z")}
      onEventChange={onEventChange}
      resources={spaces}
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <Calendar.ActiveView />
      <Calendar.Announcer messages={calendarAnnouncements} />
    </Calendar.Root>,
  );
  cleanup = view.unmount;
  return view.container;
}

/** Each bar in a row, in document order, with its offset from the row's top in pixels. */
const bars = (container: Element, resourceId: string) =>
  [...row(container, resourceId).querySelectorAll<HTMLElement>("[data-event-id]")].map((bar) => [
    bar.getAttribute("data-event-id"),
    Number(Number.parseFloat(bar.style.top).toFixed(2)),
  ]);

async function press(key: string) {
  await act(async () => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }),
    );
    await Promise.resolve();
  });
}

test("a room's row stacks its bookings a third of a lane apart, and a person's keeps lanes", async () => {
  const container = await show();

  // 24px lanes with 2px gaps, under 6px of padding. Document order is drawing order.
  expect(bars(container, "orchid")).toEqual([
    ["standup", 6],
    ["review", 14.67],
    ["interview", 23.33],
  ]);
  expect(bars(container, "ada")).toEqual([
    ["standup", 6],
    ["review", 32],
  ]);
  // The stack needs a lane and two thirds; two lanes need two.
  expect(Number.parseFloat(row(container, "orchid").style.height)).toBeCloseTo(12 + (5 / 3) * 26);
  expect(Number.parseFloat(row(container, "ada").style.height)).toBe(12 + 2 * 26);
});

test("moving a stacked booking to a person from the keyboard gives the pointer's change", async () => {
  const placed = (change: BookingChange | undefined) =>
    `${change?.proposed?.resourceIds.join(",")} ${change?.proposed?.start.toString()}`;
  const byPointer = vi.fn<(change: BookingChange) => void>();
  const pointed = await show(byPointer);
  const hour = (hours: number) => hours * 56;
  const interview = pointed.querySelector('[data-event-id="interview"]')!;
  // Each row's date strip spans the day, 56px an hour from x = 0.
  layOut([
    [interview, { height: 24, width: hour(0.5), x: hour(9.75), y: 23 }],
    [dayTarget(pointed, "orchid", "2026-10-08"), { height: 55, width: hour(24) }],
    [dayTarget(pointed, "ada", "2026-10-08"), { height: 64, width: hour(24), y: 55 }],
  ]);
  drag(interview, [
    [hour(9.9), 30],
    [hour(9.9), 50],
    [hour(9.9), 80],
  ]);
  await cleanup?.();

  const byKeyboard = vi.fn<(change: BookingChange) => void>();
  const keyed = await show(byKeyboard, {
    date: Temporal.PlainDate.from("2026-10-08"),
    eventId: "standup",
    kind: "event",
    resourceId: "orchid",
  });
  await act(async () => keyed.querySelector<HTMLElement>('[role="grid"] [tabindex="0"]')!.focus());
  // Through the stack in the order it's drawn, each booking over the one before it.
  const visited = [];
  for (let step = 0; step < 2; step += 1) {
    await press("ArrowRight");
    visited.push(document.activeElement?.getAttribute("data-event-id"));
  }
  await press(" ");
  await press("ArrowDown");
  await press("Enter");

  expect(visited).toEqual(["review", "interview"]);
  expect(placed(byKeyboard.mock.calls[0]?.[0])).toBe("ada 2026-10-08T09:45:00Z");
  expect(placed(byKeyboard.mock.calls[0]?.[0])).toBe(placed(byPointer.mock.calls[0]?.[0]));
});
