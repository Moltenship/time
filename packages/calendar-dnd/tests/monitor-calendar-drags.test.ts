// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import type {
  CalendarAnnouncer,
  CalendarEventProposal,
  CalendarInteractionUpdate,
} from "@moltenship/calendar-core";

import {
  attachCalendarPointer,
  monitorCalendarDrags,
  observeCalendarRegions,
  type CalendarDragFollower,
  type CalendarDragPreview,
  type CalendarEventDrag,
  type CalendarPointerOptions,
  type CalendarPoint,
} from "../src/index";
import {
  mountTimeGrid,
  place,
  pointer,
  timedEvent,
  timeZone,
  xAt,
  yAt,
  type TestEvent,
} from "./dom-fixture";

type Options = CalendarPointerOptions<TestEvent, string | number, string>;
type Proposal = CalendarEventProposal<string | number, string, TestEvent>;

const meeting = timedEvent("a", "2026-08-17T09:00Z", "2026-08-17T10:00Z", "Standup");
/** A point beside the view, where an app's drop zone would be. */
const beside: CalendarPoint = { x: 400, y: yAt("12:00") };

const cleanups: (() => void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.restoreAllMocks();
  if (vi.isFakeTimers()) vi.useRealTimers();
  // The guard that swallows a drag's trailing click expires on the next task.
  await new Promise((resolve) => setTimeout(resolve));
});

function setup(extra: Partial<Options> = {}) {
  const grid = mountTimeGrid([meeting]);
  const proposals: Proposal[] = [];
  const updates: CalendarInteractionUpdate[] = [];
  const announcer: CalendarAnnouncer = {
    announce: (update) => updates.push(update),
    formatRange: () => "range",
  };
  cleanups.push(
    attachCalendarPointer(grid.region, () => ({
      announcer,
      columns: grid.columns,
      events: grid.snapshot,
      onPropose: (proposal) => {
        proposals.push(proposal);
      },
      timeZone,
      ...extra,
    })),
  );
  return { element: grid.elements.get("a")!, grid, proposals, updates };
}

/** A monitor that follows every drag, claiming the points `claims` says. */
function follow(claims: (point: CalendarPoint) => boolean = () => false) {
  const drags: CalendarEventDrag[] = [];
  const moves: CalendarPoint[] = [];
  const ends: boolean[] = [];
  let last: CalendarPoint | null = null;
  cleanups.push(
    monitorCalendarDrags((drag) => {
      drags.push(drag);
      return {
        claims: () => last !== null && claims(last),
        end: (dropped) => ends.push(dropped),
        move: (point) => {
          last = point;
          moves.push(point);
        },
      } satisfies CalendarDragFollower;
    }),
  );
  return { drags, ends, moves };
}

/** A monitor whose followers only watch: they have no `claims`. */
function watch() {
  const previews: (CalendarDragPreview | null)[] = [];
  const ends: [boolean, CalendarDragPreview | null][] = [];
  cleanups.push(
    monitorCalendarDrags(
      () =>
        ({
          end: (dropped, landing) => ends.push([dropped, landing]),
          preview: (preview) => previews.push(preview),
        }) satisfies CalendarDragFollower,
    ),
  );
  return { ends, previews };
}

/** Where a preview segment sits, as its inline styles place it in jsdom's viewport. */
function boxOf(segment: HTMLElement) {
  const [x, y] = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(segment.style.transform)!.slice(1);
  return {
    height: Number.parseFloat(segment.style.height),
    width: Number.parseFloat(segment.style.width),
    x: Number(x),
    y: Number(y),
  };
}

function ghosts(region: HTMLElement) {
  return [...region.querySelectorAll<HTMLElement>("[data-calendar-ghost]")];
}

describe("monitorCalendarDrags", () => {
  test("offers a move as it starts and follows it to a drop in the view", () => {
    const { element, proposals } = setup();
    const { drags, ends, moves } = follow();

    pointer("pointerdown", element, xAt("2026-08-17"), yAt("09:30"));
    expect(drags).toHaveLength(0);
    pointer("pointermove", element, xAt("2026-08-17"), yAt("11:30"));
    pointer("pointerup", element, xAt("2026-08-17"), yAt("11:30"));

    expect(drags).toEqual([
      {
        element,
        event: expect.objectContaining({ event: meeting, id: "a" }),
        origin: { x: xAt("2026-08-17"), y: yAt("09:30") },
        refresh: expect.any(Function),
      },
    ]);
    expect(moves.at(-1)).toEqual({ x: xAt("2026-08-17"), y: yAt("11:30") });
    expect(proposals).toHaveLength(1);
    expect(ends).toEqual([false]);
  });

  test("hands a release over a claimed zone to it, proposing and announcing nothing", () => {
    const { element, grid, proposals, updates } = setup();
    const { ends } = follow((point) => point.x > 300);

    pointer("pointerdown", element, xAt("2026-08-17"), yAt("09:30"));
    pointer("pointermove", element, xAt("2026-08-17"), yAt("11:30"));
    pointer("pointermove", element, beside.x, beside.y);

    // A copy of the event follows the pointer, under where it was pressed.
    const [copy] = ghosts(grid.region);
    expect(copy!.hasAttribute("data-outside")).toBe(true);
    expect(copy!.getAttribute("data-calendar-ghost")).toBe("event");
    expect(copy!.textContent).toBe("Standup");
    expect(copy!.style.transform).toBe(`translate3d(${beside.x - 50}px, ${beside.y - 20}px, 0)`);

    pointer("pointerup", element, beside.x, beside.y);
    expect(proposals).toHaveLength(0);
    expect(ends).toEqual([true]);
    // The drag starts on its first move, then leaves for the zone; the release says nothing.
    expect(updates.map(({ phase }) => phase)).toEqual(["start", "step"]);
    expect(ghosts(grid.region)).toHaveLength(0);
  });

  test("hides the in-view preview while a zone over the view claims the point", () => {
    const { element, grid, proposals } = setup();
    const { ends } = follow(() => true);

    pointer("pointerdown", element, xAt("2026-08-17"), yAt("09:30"));
    pointer("pointermove", element, xAt("2026-08-18"), yAt("11:30"));

    expect(ghosts(grid.region).map((ghost) => ghost.hasAttribute("data-outside"))).toEqual([true]);
    pointer("pointerup", element, xAt("2026-08-18"), yAt("11:30"));
    expect(proposals).toHaveLength(0);
    expect(ends).toEqual([true]);
  });

  test("cancels a release over nowhere and tells its followers no zone took it", () => {
    const { element, grid, proposals, updates } = setup();
    const { ends } = follow();

    pointer("pointerdown", element, xAt("2026-08-17"), yAt("09:30"));
    pointer("pointermove", element, beside.x, beside.y);
    expect(ghosts(grid.region)[0]!.hasAttribute("data-outside")).toBe(true);
    pointer("pointerup", element, beside.x, beside.y);

    expect(proposals).toHaveLength(0);
    expect(ends).toEqual([false]);
    expect(updates.at(-1)?.phase).toBe("cancel");
  });

  test("shows nothing outside the view when no one follows", () => {
    const { element, grid } = setup();

    pointer("pointerdown", element, xAt("2026-08-17"), yAt("09:30"));
    pointer("pointermove", element, beside.x, beside.y);

    expect(ghosts(grid.region)).toHaveLength(0);
    pointer("pointerup", element, beside.x, beside.y);
  });

  test("ends its followers on Escape", () => {
    const { element, proposals } = setup();
    const { ends } = follow(() => true);

    pointer("pointerdown", element, xAt("2026-08-17"), yAt("09:30"));
    pointer("pointermove", element, beside.x, beside.y);
    window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    pointer("pointerup", element, beside.x, beside.y);

    expect(ends).toEqual([false]);
    expect(proposals).toHaveLength(0);
  });

  test("doesn't offer resizes or creates", () => {
    const { element, grid } = setup();
    const { drags } = follow();

    const handle = element.querySelector<HTMLElement>('[data-resize="end"]')!;
    pointer("pointerdown", handle, xAt("2026-08-17"), yAt("09:59"));
    pointer("pointermove", handle, xAt("2026-08-17"), yAt("11:00"));
    pointer("pointerup", handle, xAt("2026-08-17"), yAt("11:00"));
    const column = grid.region.querySelector<HTMLElement>(
      '[data-date="2026-08-18"]:not([data-all-day])',
    )!;
    pointer("pointerdown", column, xAt("2026-08-18"), yAt("13:00"));
    pointer("pointermove", column, xAt("2026-08-18"), yAt("14:00"));
    pointer("pointerup", column, xAt("2026-08-18"), yAt("14:00"));

    expect(drags).toHaveLength(0);
  });

  test("asks again on refresh, for a follower whose answer changed in place", () => {
    const { element, grid } = setup();
    let claiming = false;
    const drags: CalendarEventDrag[] = [];
    cleanups.push(
      monitorCalendarDrags((drag) => {
        drags.push(drag);
        return { claims: () => claiming };
      }),
    );

    pointer("pointerdown", element, xAt("2026-08-17"), yAt("09:30"));
    pointer("pointermove", element, xAt("2026-08-17"), yAt("11:30"));
    expect(ghosts(grid.region)[0]!.hasAttribute("data-outside")).toBe(false);

    claiming = true;
    drags[0]!.refresh();
    expect(ghosts(grid.region)[0]!.hasAttribute("data-outside")).toBe(true);
    pointer("pointerup", element, xAt("2026-08-17"), yAt("11:30"));
  });

  test("holds the view still while a zone claims the point", () => {
    vi.useFakeTimers();
    const container = document.createElement("div");
    container.getBoundingClientRect = () =>
      ({ bottom: 600, left: 0, right: 200, top: 0 }) as DOMRect;
    let scrollTop = 0;
    Object.defineProperty(container, "scrollTop", {
      get: () => scrollTop,
      set: (value: number) => (scrollTop = Math.max(0, value)),
    });
    const { element } = setup({ scrollContainer: { current: container } });
    follow(() => true);

    pointer("pointerdown", element, 50, yAt("09:30"));
    pointer("pointermove", element, 50, 590);
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();

    expect(scrollTop).toBe(0);
    pointer("pointerup", element, 50, 590);
  });

  test("holds the view still while the pointer is off it on the way to a zone", () => {
    vi.useFakeTimers();
    const container = document.createElement("div");
    container.getBoundingClientRect = () =>
      ({ bottom: 600, left: 0, right: 200, top: 0 }) as DOMRect;
    let scrollTop = 0;
    Object.defineProperty(container, "scrollTop", {
      get: () => scrollTop,
      set: (value: number) => (scrollTop = Math.max(0, value)),
    });
    const { element } = setup({ scrollContainer: { current: container } });
    follow();

    pointer("pointerdown", element, 50, yAt("09:30"));
    // Beside the view, level with the bottom of its scroller: on the way to a sidebar.
    pointer("pointermove", element, 300, 590);
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    expect(scrollTop).toBe(0);

    // Back over the view and clear of its edges, then near one, it scrolls as ever.
    pointer("pointermove", element, 50, 300);
    pointer("pointermove", element, 50, 590);
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    expect(scrollTop).toBeGreaterThan(0);
    pointer("pointerup", element, 50, 590);
  });

  test("shows the copy only off the view, not over parts of it without a slot", () => {
    const { element, grid } = setup();
    follow();
    // A header over the columns, which hides the slots beneath it.
    const header = document.createElement("div");
    header.setAttribute("data-occludes", "");
    grid.region.append(place(header, { height: 30, left: 0, top: 0, width: 200 }, 0));

    pointer("pointerdown", element, xAt("2026-08-17"), yAt("09:30"));
    pointer("pointermove", element, xAt("2026-08-17"), 10);
    expect(ghosts(grid.region)).toHaveLength(0);
    pointer("pointermove", element, beside.x, beside.y);
    expect(ghosts(grid.region)[0]!.hasAttribute("data-outside")).toBe(true);
    pointer("pointerup", element, beside.x, beside.y);
  });

  test("lands nowhere under a sheet over the view, between its zones", () => {
    const { element, grid, proposals, updates } = setup();
    const { ends } = follow();
    // A sheet of drop zones over the second day, outside the view.
    const sheet = place(
      document.createElement("div"),
      { height: 1000, left: 100, top: 0, width: 100 },
      0,
    );
    document.body.append(sheet);

    pointer("pointerdown", element, xAt("2026-08-17"), yAt("09:30"));
    pointer("pointermove", element, xAt("2026-08-18"), yAt("11:30"));
    expect(ghosts(grid.region).map((ghost) => ghost.hasAttribute("data-outside"))).toEqual([true]);
    pointer("pointerup", element, xAt("2026-08-18"), yAt("11:30"));

    expect(proposals).toHaveLength(0);
    expect(ends).toEqual([false]);
    expect(updates.at(-1)?.phase).toBe("cancel");
  });

  test("scrolls at once when a followed drag starts near the edge", () => {
    vi.useFakeTimers();
    const container = document.createElement("div");
    container.getBoundingClientRect = () =>
      ({ bottom: 600, left: 0, right: 200, top: 0 }) as DOMRect;
    let scrollTop = 0;
    Object.defineProperty(container, "scrollTop", {
      get: () => scrollTop,
      set: (value: number) => (scrollTop = Math.max(0, value)),
    });
    const late = timedEvent("late", "2026-08-17T13:00Z", "2026-08-17T14:00Z");
    const grid = mountTimeGrid([late]);
    cleanups.push(
      attachCalendarPointer(grid.region, () => ({
        columns: grid.columns,
        events: grid.snapshot,
        onPropose: () => undefined,
        scrollContainer: { current: container },
        timeZone,
      })),
    );
    follow();
    const element = grid.elements.get("late")!;

    pointer("pointerdown", element, 50, 580);
    pointer("pointermove", element, 50, 590);
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    expect(scrollTop).toBeGreaterThan(0);
    pointer("pointerup", element, 50, 590);
  });

  test("scrolls a view it came back into only once clear of the edges", () => {
    vi.useFakeTimers();
    const container = document.createElement("div");
    container.getBoundingClientRect = () =>
      ({ bottom: 600, left: 0, right: 200, top: 0 }) as DOMRect;
    let scrollTop = 0;
    Object.defineProperty(container, "scrollTop", {
      get: () => scrollTop,
      set: (value: number) => (scrollTop = Math.max(0, value)),
    });
    const { element } = setup({ scrollContainer: { current: container } });
    follow();
    const frames = () => {
      vi.advanceTimersToNextFrame();
      vi.advanceTimersToNextFrame();
    };

    pointer("pointerdown", element, 50, yAt("09:30"));
    pointer("pointermove", element, 300, 300);
    // Back in across the bottom edge's band: still.
    pointer("pointermove", element, 50, 590);
    frames();
    expect(scrollTop).toBe(0);
    pointer("pointermove", element, 50, 300);
    pointer("pointermove", element, 50, 590);
    frames();
    expect(scrollTop).toBeGreaterThan(0);
    pointer("pointerup", element, 50, 590);
  });

  test("reports a monitor that throws and keeps the drag going", () => {
    // jsdom has no `reportError`, so the error goes to the console.
    const report = vi.spyOn(console, "error").mockImplementation(() => {});
    const { element, proposals } = setup();
    cleanups.push(
      monitorCalendarDrags(() => {
        throw new Error("monitor-failed");
      }),
    );

    pointer("pointerdown", element, xAt("2026-08-17"), yAt("09:30"));
    pointer("pointermove", element, xAt("2026-08-17"), yAt("11:30"));
    pointer("pointerup", element, xAt("2026-08-17"), yAt("11:30"));

    expect(report).toHaveBeenCalledWith(new Error("monitor-failed"));
    expect(proposals).toHaveLength(1);
  });

  test("stops offering drags once the monitor stops", () => {
    const { element } = setup();
    const { drags } = follow();
    cleanups.pop()!();

    pointer("pointerdown", element, xAt("2026-08-17"), yAt("09:30"));
    pointer("pointermove", element, xAt("2026-08-17"), yAt("11:30"));
    pointer("pointerup", element, xAt("2026-08-17"), yAt("11:30"));

    expect(drags).toHaveLength(0);
  });
});

describe("followers that watch", () => {
  test("hear where the preview lands as it moves, and where the move was dropped", () => {
    const { element, grid, proposals } = setup();
    const { ends, previews } = watch();

    pointer("pointerdown", element, xAt("2026-08-17"), yAt("09:30"));
    pointer("pointermove", element, xAt("2026-08-18"), yAt("11:30"));
    const [segment] = ghosts(grid.region);
    const shown = { label: "range", rects: [boxOf(segment!)], validity: null };
    expect(previews.at(-1)).toEqual(shown);

    // The release refreshes the landing without telling followers the same preview again.
    const heard = previews.length;
    pointer("pointerup", element, xAt("2026-08-18"), yAt("11:30"));
    expect(previews).toHaveLength(heard);
    expect(proposals).toHaveLength(1);
    expect(ends).toEqual([[false, shown]]);
  });

  test("hear what the policies would say about the drop", () => {
    const { element } = setup({
      check: () => ({ reason: "overlap", status: "rejected" }) as never,
    });
    const { ends, previews } = watch();

    pointer("pointerdown", element, xAt("2026-08-17"), yAt("09:30"));
    pointer("pointermove", element, xAt("2026-08-18"), yAt("11:30"));
    expect(previews.at(-1)?.validity).toBe("invalid");

    // The release proposes all the same; the root's policies reject it.
    pointer("pointerup", element, xAt("2026-08-18"), yAt("11:30"));
    expect(ends[0]![1]?.validity).toBe("invalid");
  });

  test("end with no drop after Escape, or a release where the event already was", () => {
    const { element, proposals } = setup();
    const { ends } = watch();

    pointer("pointerdown", element, xAt("2026-08-17"), yAt("09:30"));
    pointer("pointermove", element, xAt("2026-08-18"), yAt("11:30"));
    window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    pointer("pointerup", element, xAt("2026-08-18"), yAt("11:30"));

    pointer("pointerdown", element, xAt("2026-08-17"), yAt("09:30"));
    pointer("pointermove", element, xAt("2026-08-18"), yAt("11:30"));
    pointer("pointermove", element, xAt("2026-08-17"), yAt("09:30"));
    pointer("pointerup", element, xAt("2026-08-17"), yAt("09:30"));

    expect(ends).toEqual([
      [false, null],
      [false, null],
    ]);
    expect(proposals).toHaveLength(0);
  });

  test("end with no landing when the browser takes the pointer", () => {
    const { element, proposals } = setup();
    const { ends } = watch();

    pointer("pointerdown", element, xAt("2026-08-17"), yAt("09:30"));
    pointer("pointermove", element, xAt("2026-08-18"), yAt("11:30"));
    pointer("pointercancel", element, xAt("2026-08-18"), yAt("11:30"));

    expect(ends).toEqual([[false, null]]);
    expect(proposals).toHaveLength(0);
  });

  test("hear the preview go when a zone claims the pointer, and no landing on its release", () => {
    const { element, proposals } = setup();
    follow((point) => point.x > 300);
    const { ends, previews } = watch();

    pointer("pointerdown", element, xAt("2026-08-17"), yAt("09:30"));
    pointer("pointermove", element, xAt("2026-08-17"), yAt("11:30"));
    expect(previews.at(-1)).not.toBeNull();
    pointer("pointermove", element, beside.x, beside.y);
    expect(previews.at(-1)).toBeNull();
    pointer("pointerup", element, beside.x, beside.y);

    expect(ends).toEqual([[true, null]]);
    expect(proposals).toHaveLength(0);
  });

  test("leave a sheet over the view be: a release under it still proposes", () => {
    const { element, grid, proposals } = setup();
    const { ends } = watch();
    // Over the second day, as the sheet of drop zones in the test above.
    const sheet = place(
      document.createElement("div"),
      { height: 1000, left: 100, top: 0, width: 100 },
      0,
    );
    document.body.append(sheet);
    cleanups.push(() => sheet.remove());

    pointer("pointerdown", element, xAt("2026-08-17"), yAt("09:30"));
    pointer("pointermove", element, xAt("2026-08-18"), yAt("11:30"));
    expect(ghosts(grid.region).map((ghost) => ghost.hasAttribute("data-outside"))).toEqual([false]);
    pointer("pointerup", element, xAt("2026-08-18"), yAt("11:30"));

    expect(proposals).toHaveLength(1);
    expect(ends[0]![1]).not.toBeNull();
  });

  test("scroll the view at its edge at once, back in from off it, and hear each scroll", () => {
    vi.useFakeTimers();
    const container = document.createElement("div");
    container.getBoundingClientRect = () =>
      ({ bottom: 600, left: 0, right: 200, top: 0 }) as DOMRect;
    let scrollTop = 0;
    Object.defineProperty(container, "scrollTop", {
      get: () => scrollTop,
      set: (value: number) => (scrollTop = Math.max(0, value)),
    });
    const { element, grid } = setup({ scrollContainer: { current: container } });
    const { previews } = watch();
    // The columns move up as the container scrolls, as they would in a browser.
    for (const column of grid.region.querySelectorAll<HTMLElement>("[data-date]")) {
      const at = column.getBoundingClientRect();
      column.getBoundingClientRect = () =>
        ({
          bottom: at.bottom - scrollTop,
          height: at.height,
          left: at.left,
          right: at.right,
          top: at.top - scrollTop,
          width: at.width,
          x: at.left,
          y: at.top - scrollTop,
        }) as DOMRect;
    }

    pointer("pointerdown", element, 50, yAt("09:30"));
    pointer("pointermove", element, 300, 300);
    // Unlike a drag a zone follows, it scrolls as soon as it's back in the edge's band.
    pointer("pointermove", element, 50, 590);
    const heard = previews.length;
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();

    expect(scrollTop).toBeGreaterThan(0);
    expect(previews.length).toBeGreaterThan(heard);
    pointer("pointerup", element, 50, 590);
  });

  test("change nothing about the drag: no copy follows the pointer off the view", () => {
    const { element, grid } = setup();
    const { previews } = watch();

    pointer("pointerdown", element, xAt("2026-08-17"), yAt("09:30"));
    pointer("pointermove", element, xAt("2026-08-17"), yAt("11:30"));
    pointer("pointermove", element, beside.x, beside.y);

    expect(ghosts(grid.region)).toHaveLength(0);
    expect(previews.at(-1)).toBeNull();
    pointer("pointerup", element, beside.x, beside.y);
  });
});

describe("observeCalendarRegions", () => {
  test("reports an observer that throws, and views still attach and detach", () => {
    const report = vi.spyOn(console, "error").mockImplementation(() => {});
    cleanups.push(
      observeCalendarRegions(() => {
        throw new Error("observer-failed");
      }),
    );
    const { element, proposals } = setup();

    expect(report).toHaveBeenCalledWith(new Error("observer-failed"));
    pointer("pointerdown", element, xAt("2026-08-17"), yAt("09:30"));
    pointer("pointermove", element, xAt("2026-08-17"), yAt("11:30"));
    pointer("pointerup", element, xAt("2026-08-17"), yAt("11:30"));
    expect(proposals).toHaveLength(1);

    // Detaching runs the observer again, and the view stops listening all the same.
    report.mockClear();
    cleanups.pop()!();
    expect(report).toHaveBeenCalledWith(new Error("observer-failed"));
    pointer("pointerdown", element, xAt("2026-08-17"), yAt("09:30"));
    pointer("pointermove", element, xAt("2026-08-17"), yAt("12:30"));
    pointer("pointerup", element, xAt("2026-08-17"), yAt("12:30"));
    expect(proposals).toHaveLength(1);
  });
});
