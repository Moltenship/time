// @vitest-environment jsdom

import { plainDateInterval, type CalendarEnvironmentBase } from "@moltenship/calendar";
import { StrictMode, act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeAll, expect, test, vi } from "vite-plus/test";

import {
  ResourceTimelineGrid,
  type ResourceTimelineGridProps,
} from "../resource-timeline-view/resource-timeline-grid";
import type { TimelineResourceRow } from "../resource-timeline-view/resource-timeline-row";
import { click, render } from "./render";
import { ariaLabel } from "./view-fixtures";

beforeAll(() => {
  // jsdom lays nothing out, so the viewport keeps the timeline's initial 1024 × 640 geometry.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      disconnect() {}
      observe() {}
    },
  );
});

/** 50 sites of 9 rooms each: 500 rows, all expanded. */
const rows: readonly TimelineResourceRow[] = Array.from({ length: 50 }, (_, site) => [
  { depth: 0, expanded: true, id: `site-${site + 1}`, title: `Site ${site + 1}` },
  ...Array.from({ length: 9 }, (_, room) => ({
    depth: 1,
    id: `site-${site + 1}-room-${room + 1}`,
    title: `Site ${site + 1} room ${room + 1}`,
  })),
]).flat();

const environment = (direction: "ltr" | "rtl" = "ltr"): CalendarEnvironmentBase => ({
  direction,
  disambiguation: "compatible",
  locale: "en-US",
  timeZone: "America/New_York",
  weekRules: { firstDay: 1, minimalDays: 4, weekend: [6, 7] },
});

const october = plainDateInterval(
  Temporal.PlainDate.from("2026-10-01"),
  Temporal.PlainDate.from("2026-11-01"),
);

function Timeline(props: Partial<ResourceTimelineGridProps>) {
  return (
    <ResourceTimelineGrid
      environment={environment()}
      label="October 2026"
      onToggleResource={() => {}}
      range={october}
      rows={rows}
      today={Temporal.PlainDate.from("2026-10-08")}
      {...props}
    />
  );
}

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

const viewport = (container: Element) =>
  container.querySelector<HTMLElement>('[data-slot="resource-timeline-viewport"]')!;
const resourceRows = (container: Element) => [
  ...container.querySelectorAll<HTMLElement>('[role="row"][data-resource-id]'),
];

async function scrollTo(element: HTMLElement, { left = 0, top = 0 }) {
  await act(async () => {
    Object.defineProperties(element, {
      scrollLeft: { configurable: true, value: left, writable: true },
      scrollTop: { configurable: true, value: top, writable: true },
    });
    element.dispatchEvent(new Event("scroll"));
  });
}

test("500 resources over a month render only the rows and days in view", async () => {
  const view = await render(<Timeline />);
  cleanup = view.unmount;
  const grid = view.container.querySelector('[role="grid"]')!;
  const rendered = resourceRows(view.container);
  const cells = view.container.querySelectorAll('[role="gridcell"]');
  const days = view.container.querySelectorAll(
    '[role="columnheader"][aria-colindex]:not([aria-colindex="1"])',
  );

  // The grid still counts every resource and day, plus the header row and the resource column.
  expect(grid.getAttribute("aria-rowcount")).toBe("501");
  expect(grid.getAttribute("aria-colcount")).toBe("32");
  // 640px of 44px rows under a 56px header, plus overscan; 1024px of 48px days past the column.
  expect(rendered).toHaveLength(18);
  expect(days).toHaveLength(19);
  expect(cells).toHaveLength(18 * 19);
  expect(cells.length).toBeLessThan(500 * 31);
  expect(rendered[0]?.getAttribute("aria-rowindex")).toBe("2");
  expect(rendered.at(-1)?.getAttribute("aria-label")).toBe("Site 2 room 7");
});

test("scrolling swaps rows and days in and out by their stable keys", async () => {
  const view = await render(<Timeline />);
  cleanup = view.unmount;
  const first = resourceRows(view.container)[0];

  await scrollTo(viewport(view.container), { left: 48 * 10, top: 44 * 250 });
  const rendered = resourceRows(view.container);
  const days = [...view.container.querySelectorAll('[role="columnheader"]')].map(ariaLabel);

  expect(first?.isConnected).toBe(false);
  expect(rendered.length).toBeLessThan(25);
  expect(rendered.map((row) => row.getAttribute("aria-label"))).toContain("Site 26 room 1");
  expect(days).not.toContain("Thursday, October 1, 2026");
  expect(days).toContain("Thursday, October 15, 2026");
  expect(view.container.querySelectorAll('[role="gridcell"]')).toHaveLength(
    rendered.length * (days.length - 1),
  );
});

test("rows, headers and cells are named for the grid pattern", async () => {
  const view = await render(<Timeline />);
  cleanup = view.unmount;
  const row = view.container.querySelector('[data-resource-id="site-1-room-2"]')!;
  const today = view.container.querySelector('[aria-current="date"]');

  expect(row.getAttribute("aria-rowindex")).toBe("4");
  expect(row.querySelector('[role="rowheader"]')?.textContent).toBe("Site 1 room 2");
  expect(ariaLabel(row.querySelector('[role="gridcell"][aria-colindex="4"]'))).toBe(
    "Site 1 room 2, Saturday, October 3, 2026",
  );
  expect(row.querySelector('[aria-colindex="4"]')?.hasAttribute("data-weekend")).toBe(true);
  expect(ariaLabel(today)).toBe("Thursday, October 8, 2026");
  expect(view.container.querySelector('[role="columnheader"]')?.textContent).toBe("Resources");
});

test("a day shows its hours, labelled with the date above them", async () => {
  const view = await render(
    <Timeline
      label="October 8, 2026"
      range={plainDateInterval(
        Temporal.PlainDate.from("2026-10-08"),
        Temporal.PlainDate.from("2026-10-09"),
      )}
    />,
  );
  cleanup = view.unmount;
  const hours = [...view.container.querySelectorAll('[role="columnheader"][aria-label]')];

  expect(hours[9]?.textContent).toBe("9 AM");
  expect(ariaLabel(hours[9])).toBe("Thursday, October 8 at 9:00 AM");
  expect(
    view.container.querySelector('[data-slot="resource-timeline-header"] [aria-hidden]')
      ?.textContent,
  ).toBe("Thursday, October 8, 2026");
});

test("a group's toggle names the group and reports its state", async () => {
  const onToggleResource = vi.fn();
  const collapsed = rows.map((row) => (row.id === "site-1" ? { ...row, expanded: false } : row));
  const view = await render(<Timeline onToggleResource={onToggleResource} rows={collapsed} />);
  cleanup = view.unmount;
  const toggle = view.container.querySelector('[aria-label="Expand Site 1"]');

  expect(toggle?.getAttribute("aria-expanded")).toBe("false");
  expect(view.container.querySelector('[aria-label="Collapse Site 2"]')).not.toBeNull();
  expect(view.container.querySelector('[data-resource-id="site-1-room-1"] button')).toBeNull();

  await click(toggle);

  expect(onToggleResource).toHaveBeenCalledWith("site-1");
});

test("RTL mirrors the time axis and keeps the logical time in view when switching", async () => {
  const view = await render(<Timeline environment={environment("rtl")} />);
  cleanup = view.unmount;
  const grid = view.container.querySelector('[role="grid"]')!;

  expect(grid.getAttribute("dir")).toBe("rtl");
  // RTL scroll offsets run negative from the inline start; the axis reads them as logical.
  await scrollTo(viewport(view.container), { left: -48 * 10 });
  expect([...view.container.querySelectorAll('[role="columnheader"]')].map(ariaLabel)).toContain(
    "Thursday, October 15, 2026",
  );

  await view.rerender(<Timeline environment={environment("ltr")} />);

  expect(grid.getAttribute("dir")).toBe("ltr");
  expect(viewport(view.container).scrollLeft).toBe(480);
});

test("server markup is deterministic and hydrates without a mismatch", async () => {
  const markup = renderToString(<Timeline />);
  expect(renderToString(<Timeline />)).toBe(markup);

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
        <Timeline />
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
  expect(container.innerHTML).toBe(parsed);
});
