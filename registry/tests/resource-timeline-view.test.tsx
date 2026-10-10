// @vitest-environment jsdom

import { StrictMode, act, type ReactElement } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeAll, expect, test, vi } from "vite-plus/test";

import { drag, layOut } from "./pointer";
import { click, render } from "./render";
import {
  allDay,
  booking,
  dayTarget,
  row,
  rows,
  scrollTo,
  StubResizeObserver,
  Timeline,
  viewport,
  type BookingChange,
} from "./timeline-fixtures";
import { ariaLabel, text } from "./view-fixtures";

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

test("500 resources over a month render only the rows and days in view", async () => {
  const container = await show(<Timeline />);
  const grid = container.querySelector('[role="grid"]')!;
  const days = container.querySelectorAll('[role="columnheader"]:not([aria-colindex="1"])');

  // The grid still counts every resource and day, plus the header row and the resource column.
  expect(grid.getAttribute("aria-rowcount")).toBe("501");
  expect(grid.getAttribute("aria-colcount")).toBe("32");
  // 640px of 44px rows under a 64px header, plus overscan; 1024px of 48px days past the column.
  expect(rows(container)).toHaveLength(18);
  expect(days).toHaveLength(19);
  expect(container.querySelectorAll('[role="gridcell"]')).toHaveLength(18 * 19);
  expect(rows(container).at(-1)?.getAttribute("aria-label")).toBe("Room 2.7");
});

test("scrolling swaps rows and days in and out by their stable keys", async () => {
  const container = await show(<Timeline />);
  const [first, second] = rows(container);

  await scrollTo(viewport(container), { left: 48 * 10, top: 44 * 250 });
  const rendered = rows(container);
  const days = [...container.querySelectorAll('[role="columnheader"]')].map(ariaLabel);

  // The first row and today stay, as they hold the tab stop; the rest come and go.
  expect(first?.isConnected).toBe(true);
  expect(second?.isConnected).toBe(false);
  expect(days).toContain("Thursday, October 8, 2026");
  // The rows in view, a few beyond, and the first.
  expect(rendered.length).toBeLessThanOrEqual(25);
  expect(rendered.map((element) => element.getAttribute("aria-label"))).toContain("Room 26.1");
  expect(days).not.toContain("Thursday, October 1, 2026");
  expect(days).toContain("Thursday, October 15, 2026");
  expect(container.querySelectorAll('[role="gridcell"]')).toHaveLength(
    rendered.length * (days.length - 1),
  );
});

test("rows come from the resource hierarchy, and a group's toggle collapses it", async () => {
  const container = await show(<Timeline />);
  const toggle = container.querySelector('[aria-label="Collapse Site 1"]');

  expect(row(container, "site-1-room-2").getAttribute("aria-rowindex")).toBe("4");
  expect(row(container, "site-1-room-2").querySelector('[role="rowheader"]')?.textContent).toBe(
    "Room 1.2",
  );
  expect(toggle?.getAttribute("aria-expanded")).toBe("true");

  await click(toggle);

  expect(container.querySelector('[aria-label="Expand Site 1"]')).not.toBeNull();
  expect(row(container, "site-1-room-1")).toBeNull();
  expect(row(container, "site-2").getAttribute("aria-rowindex")).toBe("3");
  expect(container.querySelector('[role="grid"]')?.getAttribute("aria-rowcount")).toBe("492");
});

test("an event shows in each of its resources' rows, named after the row", async () => {
  const container = await show(
    <Timeline
      events={[
        booking(
          "Review",
          ["site-1-room-1", "site-1-room-3"],
          "2026-10-05T09:00Z",
          "2026-10-05T10:00Z",
        ),
      ]}
    />,
  );
  const copies = [...container.querySelectorAll('[data-event-id="Review"]')];

  expect(
    copies.map((copy) => copy.closest('[role="row"]')?.getAttribute("data-resource-id")),
  ).toEqual(["site-1-room-1", "site-1-room-3"]);
  expect(ariaLabel(copies[0])).toBe("Review, Monday, October 5, 9:00 – 10:00 AM, Room 1.1");
  expect(ariaLabel(copies[1])).toBe("Review, Monday, October 5, 9:00 – 10:00 AM, Room 1.3");
  // A timed event within one day shows its start time after its title.
  expect(text(copies[0])).toBe("Review9:00 AM");
  expect(ariaLabel(copies[0]?.closest('[role="gridcell"]'))).toBe(
    "Room 1.1, Monday, October 5, 2026, 1 event",
  );
  expect(ariaLabel(dayTarget(container, "site-1-room-2", "2026-10-05").parentElement)).toBe(
    "Room 1.2, Monday, October 5, 2026, no events",
  );
});

test("bars span their days and stack in lanes, and the row grows to fit them", async () => {
  const container = await show(
    <Timeline
      events={[
        allDay("Audit", ["site-1-room-1"], "2026-09-29", "2026-10-03"),
        allDay("Move", ["site-1-room-1"], "2026-10-02", "2026-10-05"),
      ]}
    />,
  );
  const audit = container.querySelector<HTMLElement>('[data-event-id="Audit"]')!;
  const move = container.querySelector<HTMLElement>('[data-event-id="Move"]')!;

  // Two lanes of 24px plus their 2px gaps, inside 6px of padding.
  expect(row(container, "site-1-room-1").style.height).toBe("64px");
  // Audit started in September: it continues from the month's first day, squared off.
  expect(audit.closest('[role="gridcell"]')?.getAttribute("aria-colindex")).toBe("2");
  expect(audit.style.width).toBe(`${2 * 48 - 2}px`);
  expect(audit.querySelector('[data-resize="start"]')).toBeNull();
  expect(audit.querySelector('[data-resize="end"]')).not.toBeNull();
  expect(move.style.top).toBe("32px");
  expect(move.style.width).toBe(`${3 * 48 - 4}px`);
});

test("dragging a bar onto another row moves it to that resource on that day", async () => {
  const onEventChange = vi.fn<(change: BookingChange) => void>();
  const container = await show(
    <Timeline
      events={[booking("Review", ["site-1-room-1"], "2026-10-05T09:00Z", "2026-10-05T10:00Z")]}
      onEventChange={onEventChange}
    />,
  );
  const event = container.querySelector('[data-event-id="Review"]')!;
  // Rows are 44px tall from y = 0; days are 48px wide from x = 0.
  const box = (date: number, rowIndex: number) => ({
    height: 44,
    width: 48,
    x: (date - 1) * 48,
    y: rowIndex * 44,
  });
  layOut([
    [event, { ...box(5, 1), width: 44 }],
    [dayTarget(container, "site-1-room-1", "2026-10-05"), box(5, 1)],
    [dayTarget(container, "site-1-room-3", "2026-10-07"), box(7, 3)],
  ]);

  drag(event, [
    [4 * 48 + 10, 44 + 10],
    [4 * 48 + 30, 44 + 30],
    [6 * 48 + 10, 3 * 44 + 10],
  ]);

  expect(onEventChange).toHaveBeenCalledOnce();
  const { proposed } = onEventChange.mock.calls[0]![0];
  expect(proposed?.resourceIds).toEqual(["site-1-room-3"]);
  expect(`${proposed?.start.toString()}/${proposed?.end.toString()}`).toBe(
    "2026-10-07T09:00:00Z/2026-10-07T10:00:00Z",
  );
});

test("a bar grabbed by a later day moves and resizes from that day", async () => {
  const onEventChange = vi.fn<(change: BookingChange) => void>();
  const container = await show(
    <Timeline
      events={[allDay("Audit", ["site-1-room-1"], "2026-10-05", "2026-10-07")]}
      onEventChange={onEventChange}
    />,
  );
  const event = container.querySelector('[data-event-id="Audit"]')!;
  const handle = event.querySelector('[data-resize="end"]')!;
  const day = (date: number) => dayTarget(container, "site-1-room-1", `2026-10-0${date}`);
  // The bar starts in October 5's cell and covers the 6th; days are 48px wide from x = 0.
  layOut([
    [handle, { height: 24, width: 6, x: 90, y: 0 }],
    [event, { height: 24, width: 96, x: 0, y: 0 }],
    ...[5, 6, 7, 8, 9].map(
      (date) => [day(date), { height: 44, width: 48, x: (date - 5) * 48, y: 0 }] as const,
    ),
  ]);

  // Grab the bar on the 6th and drop it on the 8th: two days later.
  drag(event, [
    [60, 10],
    [80, 10],
    [160, 10],
  ]);
  // Pull its end from the 6th onto the 7th: one day longer.
  drag(handle, [
    [92, 10],
    [110, 10],
    [120, 10],
  ]);

  const [[move], [resize]] = onEventChange.mock.calls as [[BookingChange], [BookingChange]];
  expect(`${move.proposed?.start.toString()}/${move.proposed?.end.toString()}`).toBe(
    "2026-10-07/2026-10-09",
  );
  expect(`${resize.proposed?.start.toString()}/${resize.proposed?.end.toString()}`).toBe(
    "2026-10-05/2026-10-08",
  );
});

test("dragging across empty days creates an all-day event in that row", async () => {
  const onEventChange = vi.fn<(change: BookingChange) => void>();
  const container = await show(<Timeline onEventChange={onEventChange} />);
  const start = dayTarget(container, "site-1-room-2", "2026-10-05");
  layOut([
    [start, { height: 44, width: 48, x: 0, y: 0 }],
    [dayTarget(container, "site-1-room-2", "2026-10-06"), { height: 44, width: 48, x: 48, y: 0 }],
    [dayTarget(container, "site-1-room-2", "2026-10-07"), { height: 44, width: 48, x: 96, y: 0 }],
  ]);

  drag(start, [
    [10, 10],
    [60, 10],
    [110, 10],
  ]);

  const [change] = onEventChange.mock.calls[0]!;
  expect(change.cause).toBe("create");
  expect(change.proposed?.resourceIds).toEqual(["site-1-room-2"]);
  expect(change.proposed?.kind).toBe("all-day");
  expect(`${change.proposed?.start.toString()}/${change.proposed?.end.toString()}`).toBe(
    "2026-10-05/2026-10-08",
  );
});

test("the day view lays bars along its hours, over a date strip per row", async () => {
  const container = await show(
    <Timeline
      events={[
        booking("Review", ["site-1-room-1"], "2026-10-08T09:00Z", "2026-10-08T10:30Z"),
        booking("Overnight", ["site-1-room-2"], "2026-10-07T22:00Z", "2026-10-08T02:00Z"),
      ]}
      view="timeline-day"
    />,
  );
  const review = container.querySelector<HTMLElement>('[data-event-id="Review"]')!;
  const overnight = container.querySelector<HTMLElement>('[data-event-id="Overnight"]')!;
  const strip = row(container, "site-1-room-1").querySelector<HTMLElement>(
    '[data-axis="inline"][data-date="2026-10-08"]',
  );
  const now = container.querySelector<HTMLElement>('[data-slot="resource-timeline-now"]');

  expect(container.querySelector('[role="grid"]')?.getAttribute("aria-colcount")).toBe("25");
  // 56px hours: 9:00 – 10:30 starts in the 9 AM cell and spans an hour and a half.
  expect(review.closest('[role="gridcell"]')?.getAttribute("aria-colindex")).toBe("11");
  expect([review.style.insetInlineStart, review.style.width]).toEqual(["2px", "80px"]);
  // Starting the evening before, it continues from midnight, squared off, without a start handle.
  expect(overnight.closest('[role="gridcell"]')?.getAttribute("aria-colindex")).toBe("2");
  expect([overnight.style.insetInlineStart, overnight.style.width]).toEqual(["0px", "110px"]);
  expect(overnight.querySelector('[data-resize="start"]')).toBeNull();
  expect(strip?.style.width).toBe(`${24 * 56}px`);
  expect(now?.style.insetInlineStart).toBe(`${208 + 12 * 56}px`);
});

test("dragging a bar along an hour row moves it by half hours, onto another row's resource", async () => {
  const onEventChange = vi.fn<(change: BookingChange) => void>();
  const container = await show(
    <Timeline
      events={[booking("Review", ["site-1-room-1"], "2026-10-08T09:00Z", "2026-10-08T10:30Z")]}
      onEventChange={onEventChange}
      view="timeline-day"
    />,
  );
  const event = container.querySelector('[data-event-id="Review"]')!;
  const hour = (hours: number) => hours * 56;
  // Each row's date strip spans the day, 56px an hour from x = 0; rows are 44px tall.
  layOut([
    [event, { height: 24, width: hour(1.5), x: hour(9), y: 6 }],
    [dayTarget(container, "site-1-room-1", "2026-10-08"), { height: 44, width: hour(24) }],
    [dayTarget(container, "site-1-room-3", "2026-10-08"), { height: 44, width: hour(24), y: 88 }],
  ]);

  drag(event, [
    [hour(9.25), 10],
    [hour(9.75), 20],
    [hour(11.25), 98],
  ]);

  const { proposed } = onEventChange.mock.calls[0]![0];
  expect(proposed?.resourceIds).toEqual(["site-1-room-3"]);
  expect(`${proposed?.start.toString()}/${proposed?.end.toString()}`).toBe(
    "2026-10-08T11:00:00Z/2026-10-08T12:30:00Z",
  );
});

test("the week view puts events without resources in an Unassigned row", async () => {
  const container = await show(
    <Timeline
      events={[booking("Lunch", [], "2026-10-06T12:00Z", "2026-10-06T13:00Z")]}
      expanded={[]}
      view="timeline-week"
    />,
  );
  // After the 50 collapsed sites.
  await scrollTo(viewport(container), { top: 44 * 40 });
  const unassigned = rows(container).at(-1)!;

  expect(ariaLabel(container.querySelector('[role="grid"]'))).toBe("Oct 5 – 11, 2026");
  expect(container.querySelectorAll('[role="columnheader"]')).toHaveLength(8);
  expect(unassigned.getAttribute("aria-label")).toBe("Unassigned");
  expect(unassigned.getAttribute("data-resource-id")).toBe("");
  expect(unassigned.querySelector('[data-event-id="Lunch"]')).not.toBeNull();
});

test("the now-line crosses today at the current time", async () => {
  const container = await show(<Timeline />);
  const now = container.querySelector<HTMLElement>('[data-slot="resource-timeline-now"]');

  // Noon on October 8, the 8th of 31 48px days, after the 208px resource column.
  expect(now?.style.insetInlineStart).toBe(`${208 + 7.5 * 48}px`);
  expect(container.querySelector('[aria-current="date"]')?.getAttribute("aria-label")).toBe(
    "Thursday, October 8, 2026",
  );
});

test("RTL mirrors the time axis and keeps the logical time in view when switching", async () => {
  const view = await render(<Timeline direction="rtl" />);
  cleanup = view.unmount;
  const grid = view.container.querySelector('[role="grid"]')!;

  expect(grid.getAttribute("dir")).toBe("rtl");
  // RTL scroll offsets run negative from the inline start; the axis reads them as logical.
  await scrollTo(viewport(view.container), { left: -48 * 10 });
  expect([...view.container.querySelectorAll('[role="columnheader"]')].map(ariaLabel)).toContain(
    "Thursday, October 15, 2026",
  );

  await view.rerender(<Timeline direction="ltr" />);

  expect(grid.getAttribute("dir")).toBe("ltr");
  expect(viewport(view.container).scrollLeft).toBe(480);
});

test("server markup is deterministic and hydrates without a mismatch", async () => {
  const events = [booking("Review", ["site-1-room-1"], "2026-10-05T09:00Z", "2026-10-05T10:00Z")];
  const markup = renderToString(<Timeline events={events} />);
  expect(renderToString(<Timeline events={events} />)).toBe(markup);

  const container = document.createElement("div");
  container.innerHTML = markup;
  document.body.append(container);
  const parsed = container.innerHTML;
  const errors: unknown[] = [];
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  let root: Root | undefined;
  await act(async () => {
    root = hydrateRoot(
      container,
      <StrictMode>
        <Timeline events={events} />
      </StrictMode>,
      { onRecoverableError: (error) => errors.push(error) },
    );
  });
  cleanup = async () => {
    await act(async () => root?.unmount());
    container.remove();
    consoleError.mockRestore();
  };

  expect(errors).toEqual([]);
  expect(consoleError).not.toHaveBeenCalled();
  // Once the bars register, one of them takes the view's tab stop; nothing else changes.
  const withoutTabStops = (html: string) => html.replaceAll(/ tabindex="-?\d"/g, "");
  expect(withoutTabStops(container.innerHTML)).toBe(withoutTabStops(parsed));
});
