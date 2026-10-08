// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import type { CalendarEventProposal } from "@moltenship/calendar-core";

import { attachCalendarPointer, type CalendarPointerOptions } from "../src/index";
import {
  ALL_DAY_HEIGHT,
  cellCenter,
  mountMonth,
  mountTimeGrid,
  pointer,
  timedEvent,
  timeZone,
  xAt,
  yAt,
  type TestEvent,
} from "./dom-fixture";

type Proposal = CalendarEventProposal<string | number, string>;
type Options = CalendarPointerOptions<TestEvent, string | number, string>;

const meeting = timedEvent("a", "2026-08-17T09:00Z", "2026-08-17T10:00Z");

let detach: (() => void) | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  detach?.();
  detach = undefined;
  if (vi.isFakeTimers()) {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  }
  // The guard that swallows a drag's trailing click expires on the next task.
  await new Promise((resolve) => setTimeout(resolve));
});

function setup(
  mount: { readonly region: HTMLElement; readonly snapshot: Options["events"] },
  extra: Partial<Options> = {},
) {
  const proposals: Proposal[] = [];
  detach = attachCalendarPointer(mount.region, () => ({
    events: mount.snapshot,
    onPropose: (proposal) => proposals.push(proposal),
    timeZone,
    ...extra,
  }));
  return proposals;
}

function ghosts(region: HTMLElement) {
  return [...region.querySelectorAll<HTMLElement>("[data-calendar-ghost]")];
}

function interval(proposal: Proposal | undefined) {
  if (proposal === undefined || proposal.cause === "delete") return undefined;
  return `${proposal.proposed.kind} ${proposal.proposed.start.toString()}/${proposal.proposed.end.toString()}`;
}

describe("time grid", () => {
  test("moves an event with a snapped preview and proposes once on drop", () => {
    const grid = mountTimeGrid([meeting]);
    const proposals = setup(grid, { columns: grid.columns });
    const element = grid.elements.get("a")!;

    pointer("pointerdown", element, xAt("2026-08-17"), yAt("09:30"));
    pointer("pointermove", element, xAt("2026-08-18"), yAt("10:40"));
    pointer("pointermove", element, xAt("2026-08-18"), yAt("11:30"));

    expect(grid.region.getAttribute("data-interaction")).toBe("move");
    expect(element.hasAttribute("data-dragging")).toBe(true);
    const [ghost] = ghosts(grid.region);
    expect(ghost).toMatchObject({ textContent: "a" });
    expect(ghost!.getAttribute("data-calendar-ghost")).toBe("event");
    expect(ghost!.hasAttribute("data-event-id")).toBe(false);
    expect(ghost!.style.transform).toBe(`translate3d(100px, ${yAt("11:00")}px, 0)`);
    expect(Number.parseFloat(ghost!.style.height)).toBeCloseTo(40);

    pointer("pointerup", element, xAt("2026-08-18"), yAt("11:30"));
    expect(proposals).toEqual([{ cause: "move", eventId: "a", proposed: expect.any(Object) }]);
    expect(interval(proposals[0])).toBe("timed 2026-08-18T11:00:00Z/2026-08-18T12:00:00Z");
    expect(ghosts(grid.region)).toHaveLength(0);
    expect(grid.region.hasAttribute("data-interaction")).toBe(false);
    expect(element.hasAttribute("data-dragging")).toBe(false);
  });

  test("leaves clicks alone but swallows the click that ends a drag", () => {
    const grid = mountTimeGrid([meeting]);
    const proposals = setup(grid, { columns: grid.columns });
    const element = grid.elements.get("a")!;
    const clicks = vi.fn();
    element.addEventListener("click", clicks);

    pointer("pointerdown", element, 50, yAt("09:30"));
    pointer("pointermove", element, 52, yAt("09:30") + 2);
    pointer("pointerup", element, 52, yAt("09:30") + 2);
    element.click();
    expect(clicks).toHaveBeenCalledTimes(1);
    expect(ghosts(grid.region)).toHaveLength(0);

    pointer("pointerdown", element, 50, yAt("09:30"));
    pointer("pointermove", element, 50, yAt("10:30"));
    pointer("pointerup", element, 50, yAt("10:30"));
    element.click();
    expect(clicks).toHaveBeenCalledTimes(1);
    expect(proposals).toHaveLength(1);
  });

  test("cancels on Escape without proposing or opening the event", () => {
    const grid = mountTimeGrid([meeting]);
    const proposals = setup(grid, { columns: grid.columns });
    const element = grid.elements.get("a")!;
    const clicks = vi.fn();
    element.addEventListener("click", clicks);

    pointer("pointerdown", element, 50, yAt("09:30"));
    pointer("pointermove", element, 50, yAt("12:00"));
    window.dispatchEvent(new KeyboardEvent("keydown", { cancelable: true, key: "Escape" }));

    expect(ghosts(grid.region)).toHaveLength(0);
    expect(grid.region.hasAttribute("data-interaction")).toBe(false);
    pointer("pointerup", element, 50, yAt("12:00"));
    element.click();
    expect(proposals).toHaveLength(0);
    expect(clicks).not.toHaveBeenCalled();
  });

  test("resizes from a handle and stops one slot from the other edge", () => {
    const grid = mountTimeGrid([meeting]);
    const proposals = setup(grid, { columns: grid.columns });
    const handle = grid.elements.get("a")!.querySelector('[data-resize="end"]')!;

    pointer("pointerdown", handle, 50, yAt("09:58"));
    pointer("pointermove", handle, 50, yAt("11:20"));
    pointer("pointerup", handle, 50, yAt("11:20"));
    pointer("pointerdown", handle, 50, yAt("09:58"));
    pointer("pointermove", handle, 50, yAt("07:00"));
    pointer("pointerup", handle, 50, yAt("07:00"));

    expect(proposals.map((proposal) => proposal.cause)).toEqual(["resize-end", "resize-end"]);
    expect(interval(proposals[0])).toBe("timed 2026-08-17T09:00:00Z/2026-08-17T11:15:00Z");
    expect(interval(proposals[1])).toBe("timed 2026-08-17T09:00:00Z/2026-08-17T09:15:00Z");
  });

  test("creates timed events from empty slots and all-day events from the all-day row", () => {
    const grid = mountTimeGrid([meeting]);
    const proposals = setup(grid, { columns: grid.columns, ghostClassName: "ghost preview" });
    const column = grid.region.querySelector('[data-date="2026-08-17"]:not([data-all-day])')!;

    pointer("pointerdown", column, 50, yAt("14:20"));
    pointer("pointermove", column, 50, yAt("13:10"));
    const [ghost] = ghosts(grid.region);
    expect(ghost!.getAttribute("data-calendar-ghost")).toBe("range");
    expect(ghost!.className).toBe("ghost preview");
    pointer("pointerup", column, 50, yAt("13:10"));

    const allDay = grid.region.querySelector('[data-date="2026-08-17"][data-all-day]')!;
    pointer("pointerdown", allDay, xAt("2026-08-17"), ALL_DAY_HEIGHT / 2);
    pointer("pointermove", allDay, xAt("2026-08-18"), ALL_DAY_HEIGHT / 2);
    expect(ghosts(grid.region)[0]!.style.width).toBe("200px");
    pointer("pointerup", allDay, xAt("2026-08-18"), ALL_DAY_HEIGHT / 2);

    expect(proposals.map((proposal) => proposal.cause)).toEqual(["create", "create"]);
    expect(interval(proposals[0])).toBe("timed 2026-08-17T13:00:00Z/2026-08-17T14:30:00Z");
    expect(interval(proposals[1])).toBe("all-day 2026-08-17/2026-08-19");
  });

  test("proposes nothing for a create or resize dropped on the other axis", () => {
    const grid = mountTimeGrid([meeting]);
    const proposals = setup(grid, { columns: grid.columns });
    const column = grid.region.querySelector('[data-date="2026-08-17"]:not([data-all-day])')!;
    const handle = grid.elements.get("a")!.querySelector('[data-resize="end"]')!;
    const allDayRow = ALL_DAY_HEIGHT / 2;

    pointer("pointerdown", column, 50, yAt("13:00"));
    pointer("pointermove", column, 50, yAt("14:00"));
    pointer("pointermove", column, 50, allDayRow);
    expect(ghosts(grid.region)).toHaveLength(0);
    pointer("pointerup", column, 50, allDayRow);

    pointer("pointerdown", handle, 50, yAt("09:58"));
    pointer("pointermove", handle, 50, yAt("12:00"));
    pointer("pointermove", handle, 50, allDayRow);
    pointer("pointerup", handle, 50, allDayRow);
    expect(proposals).toHaveLength(0);

    // Coming back to a time column resumes the gesture.
    pointer("pointerdown", column, 50, yAt("13:00"));
    pointer("pointermove", column, 50, allDayRow);
    pointer("pointermove", column, 50, yAt("14:00"));
    expect(ghosts(grid.region)).toHaveLength(1);
    pointer("pointerup", column, 50, yAt("14:00"));
    expect(interval(proposals[0])).toBe("timed 2026-08-17T13:00:00Z/2026-08-17T14:15:00Z");
  });

  test("offsets the preview when a transformed ancestor contains it", () => {
    const grid = mountTimeGrid([meeting]);
    setup(grid, { columns: grid.columns });
    const element = grid.elements.get("a")!;
    // Under a transform, a fixed box at left: 0, top: 0 sits at the ancestor's corner.
    const containingBlock = { height: 0, left: 120, top: 30, width: 0 } as DOMRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        return this.hasAttribute("data-calendar-ghost-origin") ? containingBlock : new DOMRect();
      },
    );

    pointer("pointerdown", element, 50, yAt("09:30"));
    pointer("pointermove", element, 150, yAt("11:30"));

    expect(ghosts(grid.region)[0]!.style.transform).toBe(
      `translate3d(${100 - 120}px, ${yAt("11:00") - 30}px, 0)`,
    );
  });

  test("turns a timed event into an all-day event on the all-day row", () => {
    const grid = mountTimeGrid([meeting]);
    const proposals = setup(grid, { columns: grid.columns });
    const element = grid.elements.get("a")!;

    pointer("pointerdown", element, 50, yAt("09:30"));
    pointer("pointermove", element, xAt("2026-08-18"), ALL_DAY_HEIGHT / 2);
    expect(ghosts(grid.region)[0]!.getAttribute("data-calendar-ghost")).toBe("range");
    pointer("pointerup", element, xAt("2026-08-18"), ALL_DAY_HEIGHT / 2);

    expect(interval(proposals[0])).toBe("all-day 2026-08-18/2026-08-19");
  });

  test("ignores read-only events and drops outside the view, and matches numeric IDs", () => {
    const grid = mountTimeGrid([
      timedEvent("locked", "2026-08-17T09:00Z", "2026-08-17T10:00Z", "locked"),
      timedEvent(7, "2026-08-18T09:00Z", "2026-08-18T10:00Z"),
    ]);
    const proposals = setup(grid, { columns: grid.columns });
    const locked = grid.elements.get("locked")!;
    const numeric = grid.elements.get(7)!;

    pointer("pointerdown", locked, 50, yAt("09:30"));
    pointer("pointermove", locked, 50, yAt("12:00"));
    expect(grid.region.hasAttribute("data-interaction")).toBe(false);
    pointer("pointerup", locked, 50, yAt("12:00"));

    pointer("pointerdown", numeric, 150, yAt("09:30"));
    pointer("pointermove", numeric, 900, 900);
    pointer("pointerup", numeric, 900, 900);
    expect(proposals).toHaveLength(0);

    pointer("pointerdown", numeric, 150, yAt("09:30"));
    pointer("pointermove", numeric, 150, yAt("10:30"));
    pointer("pointerup", numeric, 150, yAt("10:30"));
    expect(proposals).toMatchObject([{ cause: "move", eventId: 7 }]);
  });

  test("keeps numeric and string IDs with the same text apart", () => {
    const grid = mountTimeGrid([
      timedEvent(1, "2026-08-17T09:00Z", "2026-08-17T10:00Z"),
      timedEvent("1", "2026-08-18T09:00Z", "2026-08-18T10:00Z"),
    ]);
    const proposals = setup(grid, { columns: grid.columns });
    const numeric = grid.elements.get(1)!;
    const text = grid.elements.get("1")!;

    pointer("pointerdown", numeric, 50, yAt("09:30"));
    pointer("pointermove", numeric, 50, yAt("11:30"));
    pointer("pointerup", numeric, 50, yAt("11:30"));
    pointer("pointerdown", text, 150, yAt("09:30"));
    pointer("pointermove", text, 150, yAt("12:30"));
    pointer("pointerup", text, 150, yAt("12:30"));

    expect(
      proposals.map((proposal) => [
        proposal.cause === "create" ? null : proposal.eventId,
        interval(proposal),
      ]),
    ).toEqual([
      [1, "timed 2026-08-17T11:00:00Z/2026-08-17T12:00:00Z"],
      ["1", "timed 2026-08-18T12:00:00Z/2026-08-18T13:00:00Z"],
    ]);
  });

  test("still finds an all-numeric event rendered with a plain data-event-id", () => {
    const grid = mountTimeGrid([timedEvent(7, "2026-08-18T09:00Z", "2026-08-18T10:00Z")]);
    const proposals = setup(grid, { columns: grid.columns });
    const element = grid.elements.get(7)!;
    element.removeAttribute("data-event-id-type");

    pointer("pointerdown", element, 150, yAt("09:30"));
    pointer("pointermove", element, 150, yAt("10:30"));
    pointer("pointerup", element, 150, yAt("10:30"));
    expect(proposals).toMatchObject([{ cause: "move", eventId: 7 }]);
  });

  test("starts touch drags with a long-press and lets quick swipes scroll", () => {
    vi.useFakeTimers();
    const grid = mountTimeGrid([meeting]);
    const proposals = setup(grid, { columns: grid.columns });
    const element = grid.elements.get("a")!;
    const touch = { pointerType: "touch" };

    pointer("pointerdown", element, 50, yAt("09:30"), touch);
    pointer("pointermove", element, 50, yAt("09:30") + 20, touch);
    vi.advanceTimersByTime(300);
    expect(grid.region.hasAttribute("data-interaction")).toBe(false);
    pointer("pointerup", element, 50, yAt("09:30") + 20, touch);

    pointer("pointerdown", element, 50, yAt("09:30"), touch);
    vi.advanceTimersByTime(300);
    expect(grid.region.getAttribute("data-interaction")).toBe("move");
    const scroll = new Event("touchmove", { cancelable: true });
    window.dispatchEvent(scroll);
    expect(scroll.defaultPrevented).toBe(true);
    pointer("pointermove", element, 50, yAt("10:30"), touch);
    pointer("pointerup", element, 50, yAt("10:30"), touch);

    expect(proposals).toHaveLength(1);
    expect(interval(proposals[0])).toBe("timed 2026-08-17T10:00:00Z/2026-08-17T11:00:00Z");
  });

  test("scrolls the container while the pointer rests near its edge", () => {
    vi.useFakeTimers();
    const grid = mountTimeGrid([meeting]);
    const container = document.createElement("div");
    container.getBoundingClientRect = () =>
      ({ bottom: 600, left: 0, right: 200, top: 0 }) as DOMRect;
    let scrollTop = 0;
    Object.defineProperty(container, "scrollTop", {
      get: () => scrollTop,
      set: (value: number) => (scrollTop = Math.max(0, value)),
    });
    setup(grid, { columns: grid.columns, scrollContainer: { current: container } });
    const element = grid.elements.get("a")!;

    pointer("pointerdown", element, 50, yAt("09:30"));
    pointer("pointermove", element, 50, 590);
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    expect(scrollTop).toBeGreaterThan(0);

    pointer("pointermove", element, 50, 300);
    const settled = scrollTop;
    vi.advanceTimersToNextFrame();
    expect(scrollTop).toBe(settled);
  });

  test("cleans up a drag in progress when detached", () => {
    const grid = mountTimeGrid([meeting]);
    const proposals = setup(grid, { columns: grid.columns });
    const element = grid.elements.get("a")!;

    pointer("pointerdown", element, 50, yAt("09:30"));
    pointer("pointermove", element, 50, yAt("12:00"));
    detach?.();
    detach = undefined;
    pointer("pointerup", element, 50, yAt("12:00"));

    expect(ghosts(grid.region)).toHaveLength(0);
    expect(grid.region.hasAttribute("data-interaction")).toBe(false);
    expect(proposals).toHaveLength(0);
  });
});

describe("month grid", () => {
  test("moves an event between day cells and keeps its time", () => {
    const month = mountMonth([timedEvent("m", "2026-08-18T09:00Z", "2026-08-18T10:00Z")]);
    const proposals = setup(month);
    const element = month.elements.get("m")!;
    const from = cellCenter("2026-08-18");
    const to = cellCenter("2026-08-27");

    pointer("pointerdown", element, from.x, from.y);
    pointer("pointermove", element, to.x, to.y);
    expect(ghosts(month.region).map((ghost) => ghost.style.transform)).toEqual([
      "translate3d(400px, 80px, 0)",
    ]);
    pointer("pointerup", element, to.x, to.y);

    expect(interval(proposals[0])).toBe("timed 2026-08-27T09:00:00Z/2026-08-27T10:00:00Z");
  });

  test("creates an all-day range across week rows", () => {
    const month = mountMonth([]);
    const proposals = setup(month);
    const from = cellCenter("2026-08-20");
    const to = cellCenter("2026-08-25");
    const cell = month.region.querySelector('[data-date="2026-08-20"]')!;

    pointer("pointerdown", cell, from.x, from.y);
    pointer("pointermove", cell, to.x, to.y);
    expect(ghosts(month.region).map(({ style }) => `${style.transform} ${style.width}`)).toEqual([
      "translate3d(400px, 0px, 0) 300px",
      "translate3d(0px, 80px, 0) 300px",
    ]);
    pointer("pointerup", cell, to.x, to.y);

    expect(interval(proposals[0])).toBe("all-day 2026-08-20/2026-08-26");
  });
});
