// @vitest-environment jsdom

import type { CalendarFocus } from "@moltenship/calendar";
import { act, type ReactElement } from "react";
import { afterEach, beforeAll, expect, test, vi } from "vite-plus/test";

import { drag, layOut } from "./pointer";
import { render } from "./render";
import {
  booking,
  dayTarget,
  row,
  scrollTo,
  StubResizeObserver,
  Timeline,
  viewport,
  type BookingChange,
} from "./timeline-fixtures";
import { ariaLabel } from "./view-fixtures";

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
});

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

async function show(element: ReactElement) {
  const view = await render(element);
  cleanup = view.unmount;
  return view.container;
}

async function press(key: string, init: KeyboardEventInit = {}) {
  await act(async () => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, ...init }),
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

const day = (date: string, resourceId: string): CalendarFocus => ({
  date: Temporal.PlainDate.from(date),
  kind: "day",
  resourceId,
});

test("the grid is one tab stop, entering on today in the first row", async () => {
  const container = await show(
    <Timeline
      events={[booking("Review", ["site-1-room-1"], "2026-10-05T09:00Z", "2026-10-05T10:00Z")]}
    />,
  );

  expect(container.querySelectorAll('[role="grid"] [tabindex="0"]')).toHaveLength(1);
  await tabIn(container);
  expect(focused()).toBe("Site 1, expanded, Thursday, October 8, 2026");
});

test("arrow keys move along rows and between them, and focus outlives scrolling away", async () => {
  const container = await show(<Timeline />);
  await tabIn(container);

  await press("ArrowDown");
  await press("ArrowDown");
  await press("ArrowRight");
  expect(focused()).toBe("Room 1.2, Friday, October 9, 2026");

  // Scrolled far away, the focused row and day still render and keep DOM focus.
  await scrollTo(viewport(container), { left: 48 * 25, top: 44 * 300 });
  expect(row(container, "site-1-room-2")).not.toBeNull();
  expect(focused()).toBe("Room 1.2, Friday, October 9, 2026");

  await press("ArrowDown");
  expect(focused()).toBe("Room 1.3, Friday, October 9, 2026");
  // The month's last day is far outside the 19 days in view; it renders to take focus.
  await press("End");
  expect(focused()).toBe("Room 1.3, Saturday, October 31, 2026");
  await press("Home");
  expect(focused()).toBe("Room 1.3, Thursday, October 1, 2026");
});

test("a keyboard move across rows proposes the same change as a pointer drop", async () => {
  const review = booking("Review", ["site-1-room-1"], "2026-10-05T09:00Z", "2026-10-05T10:00Z");
  const placed = (change: BookingChange | undefined) =>
    change?.proposed === null || change === undefined
      ? undefined
      : `${change.proposed.resourceIds.join()} ${change.proposed.start.toString()}/${change.proposed.end.toString()}`;

  const byPointer = vi.fn<(change: BookingChange) => void>();
  const pointed = await show(<Timeline events={[review]} onEventChange={byPointer} />);
  const event = pointed.querySelector('[data-event-id="Review"]')!;
  layOut([
    [event, { height: 24, width: 44, x: 4 * 48, y: 50 }],
    [
      dayTarget(pointed, "site-1-room-1", "2026-10-05"),
      { height: 44, width: 48, x: 4 * 48, y: 44 },
    ],
    [
      dayTarget(pointed, "site-1-room-3", "2026-10-07"),
      { height: 44, width: 48, x: 6 * 48, y: 132 },
    ],
  ]);
  drag(event, [
    [4 * 48 + 10, 54],
    [4 * 48 + 30, 70],
    [6 * 48 + 10, 140],
  ]);
  await cleanup?.();

  const byKeyboard = vi.fn<(change: BookingChange) => void>();
  const keyed = await show(
    <Timeline
      defaultFocus={{
        date: Temporal.PlainDate.from("2026-10-05"),
        eventId: "Review",
        kind: "event",
        resourceId: "site-1-room-1",
      }}
      events={[review]}
      onEventChange={byKeyboard}
    />,
  );
  await tabIn(keyed);
  expect(focused()).toBe("Review, Monday, October 5, 9:00 – 10:00 AM, Room 1.1");
  await press(" ");
  await press("ArrowDown");
  await press("ArrowDown");
  await press("ArrowRight");
  await press("ArrowRight");
  await press("Enter");

  expect(placed(byKeyboard.mock.calls[0]?.[0])).toBe(
    "site-1-room-3 2026-10-07T09:00:00Z/2026-10-07T10:00:00Z",
  );
  expect(placed(byKeyboard.mock.calls[0]?.[0])).toBe(placed(byPointer.mock.calls[0]?.[0]));
});

test("Space on a day drafts an all-day event in that row, and Enter creates it", async () => {
  const onEventChange = vi.fn<(change: BookingChange) => void>();
  const container = await show(
    <Timeline defaultFocus={day("2026-10-06", "site-1-room-2")} onEventChange={onEventChange} />,
  );
  await tabIn(container);
  await press(" ");
  await press("ArrowRight");

  const draft = container.querySelector('[data-slot="resource-timeline-draft"]');
  expect(draft?.closest('[role="row"]')?.getAttribute("data-resource-id")).toBe("site-1-room-2");
  await press("Enter");

  const [change] = onEventChange.mock.calls[0]!;
  expect(change.cause).toBe("create");
  expect(change.proposed?.resourceIds).toEqual(["site-1-room-2"]);
  expect(`${change.proposed?.start.toString()}/${change.proposed?.end.toString()}`).toBe(
    "2026-10-06/2026-10-08",
  );
});

test("in the day view, Space on a slot drafts an hour that grows along the row", async () => {
  const onEventChange = vi.fn<(change: BookingChange) => void>();
  const container = await show(
    <Timeline
      defaultFocus={{
        date: Temporal.PlainDate.from("2026-10-08"),
        kind: "slot",
        resourceId: "site-1-room-2",
        time: Temporal.PlainTime.from("09:00"),
      }}
      onEventChange={onEventChange}
      view="timeline-day"
    />,
  );
  await tabIn(container);
  expect(focused()).toBe("Room 1.2, Thursday, October 8 at 9:00 AM");
  await press(" ");
  await press("ArrowRight");
  await press("Enter");

  const [change] = onEventChange.mock.calls[0]!;
  expect(change.proposed?.resourceIds).toEqual(["site-1-room-2"]);
  expect(`${change.proposed?.start.toString()}/${change.proposed?.end.toString()}`).toBe(
    "2026-10-08T09:00:00Z/2026-10-08T10:30:00Z",
  );
});

test("Shift+Enter on a group's cell collapses and expands the group", async () => {
  const container = await show(<Timeline defaultFocus={day("2026-10-08", "site-1")} />);
  await tabIn(container);

  await press("Enter", { shiftKey: true });
  expect(row(container, "site-1-room-1")).toBeNull();
  expect(focused()).toBe("Site 1, collapsed, Thursday, October 8, 2026");

  await press("Enter", { shiftKey: true });
  expect(row(container, "site-1-room-1")).not.toBeNull();
});

test("in RTL the arrow keys follow the reading direction", async () => {
  const container = await show(
    <Timeline defaultFocus={day("2026-10-08", "site-1-room-1")} direction="rtl" />,
  );
  await tabIn(container);

  await press("ArrowLeft");
  expect(focused()).toBe("Room 1.1, Friday, October 9, 2026");
  await press("ArrowRight");
  await press("ArrowRight");
  expect(focused()).toBe("Room 1.1, Wednesday, October 7, 2026");
});
