// @vitest-environment jsdom

import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEvent,
  type CalendarEventChange,
} from "@moltenship/calendar";
import { act } from "react";
import { afterEach, expect, test, vi } from "vite-plus/test";

import { createMonthView } from "../month-view/month-view";
import { createWeekView } from "../time-grid-view/time-grid-view";
import { render } from "./render";

type Meeting = CalendarEvent<null, string, string>;
type Change = CalendarEventChange<Meeting, string, string>;

const standup: Meeting = {
  data: null,
  end: Temporal.Instant.from("2026-10-08T10:00:00Z"),
  id: "standup",
  kind: "timed",
  start: Temporal.Instant.from("2026-10-08T09:00:00Z"),
  title: "Standup",
};

const Calendar = createCalendar<Meeting, never>()({
  eventAdapter: createCanonicalEventAdapter<null, string, string>(),
  views: [createWeekView<Meeting>(), createMonthView<Meeting>()],
});

function Application(props: {
  readonly events?: readonly Meeting[];
  readonly onEventChange: (change: Change) => void;
  readonly view: "month" | "week";
}) {
  return (
    <Calendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="UTC"
      defaultView={props.view}
      events={props.events ?? [standup]}
      locale="en-US"
      now={Temporal.Instant.from("2026-10-08T12:00:00Z")}
      onEventChange={props.onEventChange}
      weekRules={{ firstDay: 1, minimalDays: 1, weekend: [6, 7] }}
    >
      <Calendar.ActiveView />
    </Calendar.Root>
  );
}

/** jsdom has no layout: give elements viewport boxes and hit-test them topmost first. */
function layOut(boxes: readonly (readonly [Element, DOMRectInit])[]) {
  for (const [element, { height = 0, width = 0, x = 0, y = 0 }] of boxes) {
    element.getBoundingClientRect = () =>
      ({ bottom: y + height, height, left: x, right: x + width, top: y, width, x, y }) as DOMRect;
  }
  document.elementsFromPoint = (x: number, y: number) =>
    boxes
      .map(([element]) => element)
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return x >= box.left && x < box.right && y >= box.top && y < box.bottom;
      });
}

function drag(element: Element, points: readonly (readonly [number, number])[]) {
  const pointer = (type: string, [x, y]: readonly [number, number]) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
    Object.defineProperties(event, {
      isPrimary: { value: true },
      pointerId: { value: 1 },
      pointerType: { value: "mouse" },
    });
    element.dispatchEvent(event);
  };
  act(() => {
    pointer("pointerdown", points[0]!);
    for (const point of points.slice(1)) pointer("pointermove", point);
    pointer("pointerup", points.at(-1)!);
  });
}

function interval(change: Change | undefined) {
  return change?.proposed == null
    ? undefined
    : `${change.proposed.start.toString()}/${change.proposed.end.toString()}`;
}

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

test("the week view moves, resizes, and creates timed events through onEventChange", async () => {
  const onEventChange = vi.fn<(change: Change) => void>();
  const view = await render(<Application onEventChange={onEventChange} view="week" />);
  cleanup = view.unmount;

  // Monday-first columns, 100px wide and 100px per hour, below a 100px header.
  const columns = [...view.container.querySelectorAll("[data-date]:not([data-all-day])")];
  const event = view.container.querySelector('[data-event-id="standup"]')!;
  const handle = event.querySelector('[data-resize="end"]')!;
  const hour = (hours: number) => 100 + hours * 100;
  layOut([
    [handle, { height: 6, width: 100, x: 300, y: hour(10) - 6 }],
    [event, { height: 100, width: 100, x: 300, y: hour(9) }],
    ...columns.map(
      (column, index) => [column, { height: 2400, width: 100, x: index * 100, y: 100 }] as const,
    ),
  ]);

  drag(event, [
    [350, hour(9.5)],
    [360, hour(9.75)],
    [450, hour(11.5)],
  ]);
  drag(handle, [
    [350, hour(10)],
    [350, hour(10.25)],
    [350, hour(11.25)],
  ]);
  drag(columns[0]!, [
    [50, hour(14.1)],
    [50, hour(14.5)],
    [50, hour(15.3)],
  ]);

  expect(onEventChange.mock.calls.map(([change]) => [change.cause, interval(change)])).toEqual([
    ["move", "2026-10-09T11:00:00Z/2026-10-09T12:00:00Z"],
    ["resize-end", "2026-10-08T09:00:00Z/2026-10-08T11:15:00Z"],
    ["create", "2026-10-05T14:00:00Z/2026-10-05T15:30:00Z"],
  ]);
});

test("the month view moves events across days and creates all-day ranges", async () => {
  const onEventChange = vi.fn<(change: Change) => void>();
  const view = await render(<Application onEventChange={onEventChange} view="month" />);
  cleanup = view.unmount;

  // 100×100 cells; the month grid starts on Monday 2026-09-28.
  const cells = [...view.container.querySelectorAll("[data-date]")];
  const at = (date: string): [number, number] => {
    const index = cells.findIndex((cell) => cell.getAttribute("data-date") === date);
    return [(index % 7) * 100 + 50, Math.floor(index / 7) * 100 + 80];
  };
  const event = view.container.querySelector('[data-event-id="standup"]')!;
  const [ex, ey] = at("2026-10-08");
  layOut([
    [event, { height: 20, width: 100, x: ex - 50, y: ey - 10 }],
    ...cells.map(
      (cell, index) =>
        [
          cell,
          { height: 100, width: 100, x: (index % 7) * 100, y: Math.floor(index / 7) * 100 },
        ] as const,
    ),
  ]);

  drag(event, [[ex, ey], [ex + 10, ey], at("2026-10-15")]);
  drag(cells[cells.findIndex((cell) => cell.getAttribute("data-date") === "2026-10-20")]!, [
    at("2026-10-20"),
    [at("2026-10-20")[0] + 10, at("2026-10-20")[1]],
    at("2026-10-22"),
  ]);

  expect(onEventChange.mock.calls.map(([change]) => [change.cause, interval(change)])).toEqual([
    ["move", "2026-10-15T09:00:00Z/2026-10-15T10:00:00Z"],
    ["create", "2026-10-20/2026-10-23"],
  ]);
});

test("a month bar dragged by a later day lands by the cell under the pointer", async () => {
  const trip: Meeting = {
    data: null,
    end: Temporal.PlainDate.from("2026-10-09"),
    id: "trip",
    kind: "all-day",
    start: Temporal.PlainDate.from("2026-10-06"),
    title: "Trip",
  };
  const onEventChange = vi.fn<(change: Change) => void>();
  const view = await render(
    <Application events={[trip]} onEventChange={onEventChange} view="month" />,
  );
  cleanup = view.unmount;

  // 100×100 cells from Monday 2026-09-28; the bar covers Tuesday to Thursday of the second row.
  const cells = [...view.container.querySelectorAll("[data-date]")];
  const bar = view.container.querySelector('[data-event-id="trip"]')!;
  layOut([
    [bar, { height: 20, width: 300, x: 100, y: 128 }],
    ...cells.map(
      (cell, index) =>
        [
          cell,
          { height: 100, width: 100, x: (index % 7) * 100, y: Math.floor(index / 7) * 100 },
        ] as const,
    ),
  ]);

  // From Wednesday to Thursday, still over the bar itself.
  drag(bar, [
    [250, 138],
    [260, 138],
    [350, 138],
  ]);

  expect(onEventChange.mock.calls.map(([change]) => [change.cause, interval(change)])).toEqual([
    ["move", "2026-10-07/2026-10-10"],
  ]);
});

test("dragging keeps numeric and string event IDs with the same text apart", async () => {
  const MixedCalendar = createCalendar<CalendarEvent<null, string | number, string>, never>()({
    eventAdapter: createCanonicalEventAdapter<null, string | number, string>(),
    views: [createMonthView()],
  });
  const onEventChange =
    vi.fn<(change: CalendarEventChange<unknown, string | number, string>) => void>();
  const view = await render(
    <MixedCalendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="UTC"
      events={[
        { ...standup, id: 1, title: "Numeric" },
        {
          ...standup,
          end: Temporal.Instant.from("2026-10-09T10:00:00Z"),
          id: "1",
          start: Temporal.Instant.from("2026-10-09T09:00:00Z"),
          title: "Text",
        },
      ]}
      locale="en-US"
      onEventChange={onEventChange}
      weekRules={{ firstDay: 1, minimalDays: 1, weekend: [6, 7] }}
    >
      <MixedCalendar.ActiveView />
    </MixedCalendar.Root>,
  );
  cleanup = view.unmount;

  const cells = [...view.container.querySelectorAll("[data-date]")];
  const at = (date: string): [number, number] => {
    const index = cells.findIndex((cell) => cell.getAttribute("data-date") === date);
    return [(index % 7) * 100 + 50, Math.floor(index / 7) * 100 + 80];
  };
  const numeric = [...view.container.querySelectorAll("[data-event-id]")].find((element) =>
    element.textContent?.includes("Numeric"),
  )!;
  const [nx, ny] = at("2026-10-08");
  layOut([
    [numeric, { height: 20, width: 100, x: nx - 50, y: ny - 10 }],
    ...cells.map(
      (cell, index) =>
        [
          cell,
          { height: 100, width: 100, x: (index % 7) * 100, y: Math.floor(index / 7) * 100 },
        ] as const,
    ),
  ]);

  drag(numeric, [[nx, ny], [nx + 10, ny], at("2026-10-15")]);

  expect(onEventChange.mock.calls[0]?.[0]).toMatchObject({ cause: "move", eventId: 1 });
  expect(interval(onEventChange.mock.calls[0]?.[0] as Change)).toBe(
    "2026-10-15T09:00:00Z/2026-10-15T10:00:00Z",
  );
});
