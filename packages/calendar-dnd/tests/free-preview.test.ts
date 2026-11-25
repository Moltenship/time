// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import type { CalendarEventProposal, CalendarPolicyResult } from "@moltenship/calendar-core";

import {
  attachCalendarPointer,
  monitorCalendarDrags,
  type CalendarPointerOptions,
} from "../src/index";
import {
  COLUMN_WIDTH,
  HOUR_HEIGHT,
  cellCenter,
  mountMonth,
  mountResourceColumns,
  mountTimeGrid,
  mountTimelineRows,
  place,
  pointer,
  timedEvent,
  timeZone,
  xAt,
  xAtTime,
  xIn,
  yAt,
  yInRow,
  type TestEvent,
} from "./dom-fixture";

/** Counts how often a preview is laid out, to show a free move's steps within a slot don't. */
const layouts = vi.hoisted(() => ({ count: 0 }));
vi.mock("../src/ghost", async (importOriginal) => {
  const ghost = await importOriginal<typeof import("../src/ghost")>();
  return {
    ...ghost,
    ghostLayout: ((...args) => {
      layouts.count += 1;
      return ghost.ghostLayout(...args);
    }) satisfies typeof ghost.ghostLayout,
  };
});

type Proposal = CalendarEventProposal<string | number, string, TestEvent>;
type Options = CalendarPointerOptions<TestEvent, string | number, string>;
interface Mount {
  readonly columns?: Options["columns"];
  readonly elements: ReadonlyMap<string | number, HTMLElement>;
  readonly region: HTMLElement;
  readonly snapshot: Options["events"];
}

const meeting = timedEvent("a", "2026-08-17T09:00Z", "2026-08-17T10:00Z");
const hour = (minutes: number) => (minutes / 60) * HOUR_HEIGHT;

let detach: (() => void) | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  detach?.();
  detach = undefined;
  if (vi.isFakeTimers()) {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  }
  document.body.replaceChildren();
  await new Promise((resolve) => setTimeout(resolve));
});

function setup(mount: Mount, extra: Partial<Options> = {}) {
  const proposals: Proposal[] = [];
  detach?.();
  detach = attachCalendarPointer(mount.region, () => ({
    columns: "columns" in mount ? mount.columns : undefined,
    events: mount.snapshot,
    onPropose: (proposal) => {
      proposals.push(proposal);
    },
    timeZone,
    ...extra,
  }));
  return proposals;
}

/** Gives an event element a time label, as the views render one. */
function withTime(element: HTMLElement, text = "9:00 – 10:00"): HTMLElement {
  const time = document.createElement("span");
  time.setAttribute("data-event-time", "");
  time.textContent = text;
  element.append(time);
  return element;
}

const ghostsOf = (region: HTMLElement, kind: string) => [
  ...region.querySelectorAll<HTMLElement>(`[data-calendar-ghost="${kind}"]`),
];

function translation(element: HTMLElement): readonly [number, number] {
  const match = /translate3d\((-?[\d.]+)px, (-?[\d.]+)px, 0\)/u.exec(element.style.transform);
  if (match === null) throw new Error(`No translation in "${element.style.transform}"`);
  return [Number(match[1]), Number(match[2])];
}

function box(element: HTMLElement) {
  const [left, top] = translation(element);
  return {
    height: Number.parseFloat(element.style.height),
    left,
    top,
    width: Number.parseFloat(element.style.width),
  };
}

function interval(proposal: Proposal | undefined) {
  if (proposal === undefined || proposal.cause === "delete") return undefined;
  return `${proposal.proposed.kind} ${proposal.proposed.start.toString()}/${proposal.proposed.end.toString()}`;
}

type Step = readonly ["pointerdown" | "pointermove" | "pointerup", number, number];

/**
 * Runs one pointer path and records everything a drag tells the app: proposals, drafts, checks,
 * announcements, and what followers hear.
 */
function record(
  mount: Mount,
  target: () => HTMLElement,
  steps: readonly Step[],
  extra: Partial<Options>,
  pointerType = "mouse",
) {
  const heard: string[] = [];
  const stop = monitorCalendarDrags(() => ({
    claims: () => false,
    end: (dropped, landing) => heard.push(`end ${dropped} ${JSON.stringify(landing)}`),
    preview: (preview) => heard.push(`preview ${JSON.stringify(preview)}`),
  }));
  const proposals = setup(mount, {
    announcer: {
      announce: (update) =>
        heard.push(`announce ${update.phase} ${JSON.stringify(update.proposed ?? null)}`),
      formatRange: (placement) => `${placement.start.toString()}–${placement.end.toString()}`,
    },
    check: (proposal, detail) => {
      heard.push(`check ${detail.input} ${JSON.stringify(proposal)}`);
      return null as CalendarPolicyResult<TestEvent, string | number, string> | null;
    },
    onPreview: (draft) => heard.push(`draft ${JSON.stringify(draft)}`),
    ...extra,
  });
  for (const [type, x, y] of steps) {
    pointer(type, target(), x, y, { pointerType });
    // A touch drag starts once the finger has rested.
    if (type === "pointerdown" && pointerType === "touch") vi.advanceTimersByTime(450);
  }
  stop();
  return { heard, proposals: proposals.map(interval) };
}

describe("a free move", () => {
  test("proposes, checks, drafts, announces and tells followers exactly what a snapped one does", () => {
    const paths: { readonly mount: () => Mount; readonly steps: readonly Step[] }[] = [
      {
        mount: () => mountTimeGrid([meeting]),
        steps: [
          ["pointerdown", xAt("2026-08-17"), yAt("09:30")],
          ["pointermove", xAt("2026-08-17"), yAt("10:02")],
          ["pointermove", xAt("2026-08-17"), yAt("10:05")],
          ["pointermove", xAt("2026-08-18"), yAt("10:41")],
          // Over the all-day row, then off the grid, then back.
          ["pointermove", xAt("2026-08-18"), 20],
          ["pointermove", 500, yAt("11:00")],
          ["pointermove", xAt("2026-08-18"), yAt("12:20")],
          ["pointerup", xAt("2026-08-18"), yAt("12:20")],
        ],
      },
      {
        mount: () => mountMonth([meeting]),
        steps: [
          ["pointerdown", cellCenter("2026-08-17").x, cellCenter("2026-08-17").y],
          ["pointermove", cellCenter("2026-08-18").x, cellCenter("2026-08-18").y],
          ["pointermove", cellCenter("2026-08-25").x - 30, cellCenter("2026-08-25").y + 20],
          ["pointerup", cellCenter("2026-08-25").x - 30, cellCenter("2026-08-25").y + 20],
        ],
      },
    ];
    for (const { mount, steps } of paths) {
      const runs = (["snapped", "free"] as const).map((preview) => {
        const view = mount();
        return record(view, () => view.elements.get("a")!, steps, { preview });
      });
      expect(runs[0]!.proposals).toHaveLength(1);
      expect(runs[1]).toEqual(runs[0]);
    }
  });

  test("proposes the same in resource columns, a right-to-left timeline, and by touch", () => {
    vi.useFakeTimers();
    const booking = { ...meeting, resourceIds: ["room-a"] };
    const cases: {
      readonly mount: () => Mount;
      readonly pointerType?: string;
      readonly steps: readonly Step[];
    }[] = [
      {
        mount: () => mountResourceColumns([booking]),
        steps: [
          ["pointerdown", xIn("room-a"), yAt("09:30")],
          ["pointermove", xIn("room-b"), yAt("10:40")],
          ["pointerup", xIn("room-b"), yAt("10:40")],
        ],
      },
      {
        mount: () => mountTimelineRows([booking], { direction: "rtl" }),
        steps: [
          ["pointerdown", xAtTime("09:30", "rtl"), yInRow("room-a")],
          ["pointermove", xAtTime("11:10", "rtl"), yInRow("room-b")],
          ["pointerup", xAtTime("11:10", "rtl"), yInRow("room-b")],
        ],
      },
      {
        mount: () => mountTimeGrid([meeting]),
        pointerType: "touch",
        steps: [
          ["pointerdown", 50, yAt("09:30")],
          ["pointermove", 150, yAt("10:40")],
          ["pointerup", 150, yAt("10:40")],
        ],
      },
    ];
    for (const { mount, pointerType, steps } of cases) {
      const runs = (["snapped", "free"] as const).map((preview) => {
        const view = mount();
        const element = () => view.elements.get("a") ?? view.elements.get("a@room-a")!;
        return record(view, element, steps, { preview }, pointerType);
      });
      expect(runs[0]!.proposals).toHaveLength(1);
      expect(runs[1]).toEqual(runs[0]);
    }

    // In the timeline, the copy goes where the pointer does, leftward under rtl.
    const timeline = mountTimelineRows([booking], { direction: "rtl" });
    const element = timeline.elements.get("a@room-a")!;
    setup(timeline, { preview: "free" });
    const left = element.getBoundingClientRect().left;
    pointer("pointerdown", element, xAtTime("09:30", "rtl"), yInRow("room-a"));
    pointer("pointermove", element, xAtTime("11:10", "rtl"), yInRow("room-b"));
    const [clone] = ghostsOf(timeline.region, "event");
    expect(translation(clone!)[0]).toBeCloseTo(
      left + xAtTime("11:10", "rtl") - xAtTime("09:30", "rtl"),
    );
    expect(ghostsOf(timeline.region, "landing")).toHaveLength(1);
  });

  test("moves a copy of the event with the pointer, between slots, over a snapped landing box", () => {
    const grid = mountTimeGrid([meeting]);
    const element = withTime(grid.elements.get("a")!);
    setup(grid, { preview: "free" });

    pointer("pointerdown", element, 50, yAt("09:30"));
    pointer("pointermove", element, 150, yAt("10:37"));

    const [clone, ...others] = ghostsOf(grid.region, "event");
    expect(others).toHaveLength(0);
    // The element's box at the press, carried by the pointer's travel: not on a slot.
    expect(box(clone!)).toEqual({
      height: HOUR_HEIGHT,
      left: COLUMN_WIDTH,
      top: yAt("09:00") + yAt("10:37") - yAt("09:30"),
      width: COLUMN_WIDTH,
    });
    expect(clone!.style.clipPath).toBe("");
    expect(clone!.hasAttribute("data-outside")).toBe(false);
    // Its label and the landing box show where a drop lands: 10:37 snaps to 10:30.
    expect(clone!.querySelector("[data-event-time]")!.textContent).toMatch(
      /^10:00\s–\s11:00\sAM$/u,
    );
    const [landing, ...more] = ghostsOf(grid.region, "landing");
    expect(more).toHaveLength(0);
    expect(box(landing!)).toEqual({
      height: HOUR_HEIGHT,
      left: COLUMN_WIDTH,
      top: yAt("10:00"),
      width: COLUMN_WIDTH,
    });
    expect(landing!.childElementCount).toBe(0);
    expect(ghostsOf(grid.region, "range")).toHaveLength(0);
  });

  test("moves only the copy while the pointer stays within a slot: no layout, no draft", () => {
    const grid = mountTimeGrid([meeting]);
    const element = grid.elements.get("a")!;
    const onPreview = vi.fn();
    setup(grid, { onPreview, preview: "free" });

    pointer("pointerdown", element, 50, yAt("09:30"));
    pointer("pointermove", element, 50, yAt("10:31"));
    const [clone] = ghostsOf(grid.region, "event");
    const [landing] = ghostsOf(grid.region, "landing");
    const laidOut = layouts.count;
    const drafts = onPreview.mock.calls.length;
    const landingStyle = landing!.style.cssText;
    const transforms: string[] = [];
    const style = clone!.style;
    const writes = vi.spyOn(style, "setProperty");

    for (const minute of ["10:32", "10:34", "10:36"]) {
      pointer("pointermove", element, 60, yAt(minute));
      transforms.push(style.transform);
    }

    expect(layouts.count).toBe(laidOut);
    expect(onPreview.mock.calls.length).toBe(drafts);
    expect(landing!.style.cssText).toBe(landingStyle);
    expect(new Set(transforms).size).toBe(3);
    expect(writes).not.toHaveBeenCalled();
  });

  test("marks the copy and the landing box with what the policies say", () => {
    const grid = mountTimeGrid([meeting]);
    const element = grid.elements.get("a")!;
    setup(grid, {
      check: (proposal) =>
        ({
          status:
            proposal.cause !== "delete" && proposal.proposed.start.toString().includes("T11")
              ? "rejected"
              : "accepted",
          change: { warnings: [] },
        }) as unknown as CalendarPolicyResult<TestEvent, string | number, string>,
      preview: "free",
    });

    pointer("pointerdown", element, 50, yAt("09:30"));
    pointer("pointermove", element, 50, yAt("10:30"));
    expect(ghostsOf(grid.region, "event")[0]!.hasAttribute("data-invalid")).toBe(false);
    pointer("pointermove", element, 50, yAt("11:30"));
    expect(ghostsOf(grid.region, "event")[0]!.hasAttribute("data-invalid")).toBe(true);
    expect(ghostsOf(grid.region, "landing")[0]!.hasAttribute("data-invalid")).toBe(true);
  });

  test("keeps the copy under the pointer with data-outside where there is nothing to drop on", () => {
    vi.useFakeTimers();
    const grid = mountTimeGrid([meeting]);
    const element = withTime(grid.elements.get("a")!);
    const proposals = setup(grid, { preview: "free" });

    pointer("pointerdown", element, 50, yAt("09:30"));
    pointer("pointermove", element, 50, yAt("10:30"));
    pointer("pointermove", element, 500, yAt("10:30"));

    const [clone] = ghostsOf(grid.region, "event");
    expect(clone!.hasAttribute("data-outside")).toBe(true);
    expect(translation(clone!)).toEqual([450, yAt("10:00")]);
    expect(clone!.querySelector("[data-event-time]")!.textContent).toBe("9:00 – 10:00");
    expect(ghostsOf(grid.region, "landing")).toHaveLength(0);

    // Back over the grid, it lands again.
    pointer("pointermove", element, 60, yAt("10:30"));
    expect(clone!.hasAttribute("data-outside")).toBe(false);
    expect(ghostsOf(grid.region, "landing")).toHaveLength(1);

    // A release out there proposes nothing and the copy goes home.
    pointer("pointermove", element, 500, yAt("10:30"));
    pointer("pointerup", element, 500, yAt("10:30"));
    expect(proposals).toEqual([]);
    expect(clone!.isConnected).toBe(true);
    expect(clone!.style.transition).toContain("transform");
    expect(translation(clone!)).toEqual([0, yAt("09:00")]);
    vi.advanceTimersByTime(200);
    expect(clone!.isConnected).toBe(false);
  });

  test("over a month, follows the pointer over day-cell landing boxes", () => {
    const month = mountMonth([meeting]);
    const element = month.elements.get("a")!;
    setup(month, { preview: "free" });
    const from = cellCenter("2026-08-17");
    const to = cellCenter("2026-08-25");

    pointer("pointerdown", element, from.x, from.y);
    pointer("pointermove", element, to.x - 30, to.y + 20);

    const [clone] = ghostsOf(month.region, "event");
    expect(box(clone!)).toEqual({
      height: 20,
      left: from.x - 50 + to.x - 30 - from.x,
      top: from.y - 10 + to.y + 20 - from.y,
      width: 100,
    });
    const [landing] = ghostsOf(month.region, "landing");
    expect(box(landing!)).toEqual({ height: 80, left: 200, top: 80, width: 100 });
  });
});

describe("a free move's release", () => {
  test("proposes at once, then slides the copy onto the event where it renders, and removes it", () => {
    vi.useFakeTimers();
    const grid = mountTimeGrid([meeting]);
    const element = grid.elements.get("a")!;
    const moved = { height: HOUR_HEIGHT, left: COLUMN_WIDTH + 10, top: yAt("10:00"), width: 80 };
    const proposals: Proposal[] = [];
    setup(grid, {
      onPropose: (proposal) => {
        proposals.push(proposal);
        // The view renders the event where it landed, as the root's pending change does.
        place(element, moved, 1);
      },
      preview: "free",
    });

    pointer("pointerdown", element, 50, yAt("09:30"));
    pointer("pointermove", element, 150, yAt("10:37"));
    pointer("pointerup", element, 150, yAt("10:37"));

    expect(interval(proposals[0])).toBe("timed 2026-08-18T10:00:00Z/2026-08-18T11:00:00Z");
    // The landing box goes at once; the copy waits a frame for the view to render the drop.
    expect(ghostsOf(grid.region, "landing")).toHaveLength(0);
    const [clone] = ghostsOf(grid.region, "event");
    expect(clone!.style.transition).toBe("");
    vi.advanceTimersToNextFrame();
    expect(clone!.style.transition).toMatch(
      /transform var\(--calendar-ghost-settle-duration, 150ms\)/u,
    );
    expect(clone!.style.transition).toContain("ease-out");
    expect(clone!.hasAttribute("data-settling")).toBe(true);
    expect(box(clone!)).toEqual(moved);
    vi.advanceTimersByTime(200);
    expect(ghostsOf(grid.region, "event")).toHaveLength(0);
  });

  test("slides onto the landing box when the view doesn't render the event", () => {
    vi.useFakeTimers();
    const grid = mountTimeGrid([meeting]);
    const element = grid.elements.get("a")!;
    setup(grid, { onPropose: () => element.remove(), preview: "free" });

    pointer("pointerdown", element, 50, yAt("09:30"));
    pointer("pointermove", element, 150, yAt("10:37"));
    pointer("pointerup", element, 150, yAt("10:37"));
    vi.advanceTimersToNextFrame();

    const [clone] = ghostsOf(grid.region, "event");
    expect(box(clone!)).toEqual({
      height: HOUR_HEIGHT,
      left: COLUMN_WIDTH,
      top: yAt("10:00"),
      width: COLUMN_WIDTH,
    });
  });

  test("slides onto the landing box, not home, when the view hasn't rendered the change yet", () => {
    vi.useFakeTimers();
    const grid = mountTimeGrid([meeting]);
    const element = grid.elements.get("a")!;
    // The app saves first and renders the change later: the event is still where it was.
    setup(grid, { onPropose: () => new Promise(() => undefined), preview: "free" });

    pointer("pointerdown", element, 50, yAt("09:30"));
    pointer("pointermove", element, 150, yAt("10:37"));
    pointer("pointerup", element, 150, yAt("10:37"));
    vi.advanceTimersToNextFrame();

    expect(box(ghostsOf(grid.region, "event")[0]!)).toEqual({
      height: HOUR_HEIGHT,
      left: COLUMN_WIDTH,
      top: yAt("10:00"),
      width: COLUMN_WIDTH,
    });
  });

  test("goes back to the event when the drop is refused at once", async () => {
    vi.useFakeTimers();
    const grid = mountTimeGrid([meeting]);
    const element = grid.elements.get("a")!;
    setup(grid, {
      onPropose: () => Promise.resolve({ reason: "policy", status: "rejected" } as never),
      preview: "free",
    });

    pointer("pointerdown", element, 50, yAt("09:30"));
    pointer("pointermove", element, 150, yAt("10:37"));
    pointer("pointerup", element, 150, yAt("10:37"));
    // The answer arrives before the next frame, as an already-settled promise's does.
    for (let tick = 0; tick < 3; tick += 1) await Promise.resolve();
    vi.advanceTimersToNextFrame();

    expect(box(ghostsOf(grid.region, "event")[0]!)).toEqual({
      height: HOUR_HEIGHT,
      left: 0,
      top: yAt("09:00"),
      width: COLUMN_WIDTH,
    });
  });

  test("goes back to the event when the policies refuse the drop", () => {
    vi.useFakeTimers();
    const grid = mountTimeGrid([meeting]);
    const element = grid.elements.get("a")!;
    setup(grid, {
      check: () =>
        ({ status: "rejected" }) as unknown as CalendarPolicyResult<
          TestEvent,
          string | number,
          string
        >,
      preview: "free",
    });

    pointer("pointerdown", element, 50, yAt("09:30"));
    pointer("pointermove", element, 150, yAt("10:37"));
    pointer("pointerup", element, 150, yAt("10:37"));
    vi.advanceTimersToNextFrame();

    expect(translation(ghostsOf(grid.region, "event")[0]!)).toEqual([0, yAt("09:00")]);
  });

  test("goes back to the event on Escape", () => {
    vi.useFakeTimers();
    const grid = mountTimeGrid([meeting]);
    const element = grid.elements.get("a")!;
    const proposals = setup(grid, { preview: "free" });

    pointer("pointerdown", element, 50, yAt("09:30"));
    pointer("pointermove", element, 150, yAt("12:37"));
    window.dispatchEvent(new KeyboardEvent("keydown", { cancelable: true, key: "Escape" }));

    const [clone] = ghostsOf(grid.region, "event");
    expect(clone!.style.transition).toContain("transform");
    expect(box(clone!)).toEqual({
      height: HOUR_HEIGHT,
      left: 0,
      top: yAt("09:00"),
      width: COLUMN_WIDTH,
    });
    expect(ghostsOf(grid.region, "landing")).toHaveLength(0);
    vi.advanceTimersByTime(200);
    expect(ghostsOf(grid.region, "event")).toHaveLength(0);
    expect(proposals).toEqual([]);
  });

  test("removes the copy at once under reduced motion", () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
    }));
    const grid = mountTimeGrid([meeting]);
    const element = grid.elements.get("a")!;
    const proposals = setup(grid, { preview: "free" });

    pointer("pointerdown", element, 50, yAt("09:30"));
    pointer("pointermove", element, 150, yAt("10:37"));
    pointer("pointerup", element, 150, yAt("10:37"));
    expect(proposals).toHaveLength(1);
    expect(ghostsOf(grid.region, "event")).toHaveLength(0);

    pointer("pointerdown", element, 50, yAt("09:30"));
    pointer("pointermove", element, 150, yAt("10:37"));
    window.dispatchEvent(new KeyboardEvent("keydown", { cancelable: true, key: "Escape" }));
    expect(ghostsOf(grid.region, "event")).toHaveLength(0);
  });

  test("removes the copy at once when a drop zone of the app's takes it", () => {
    const grid = mountTimeGrid([meeting]);
    const element = grid.elements.get("a")!;
    const stop = monitorCalendarDrags(() => ({ claims: () => true }));
    const proposals = setup(grid, { preview: "free" });

    pointer("pointerdown", element, 50, yAt("09:30"));
    pointer("pointermove", element, 500, yAt("10:37"));
    expect(ghostsOf(grid.region, "event")[0]!.hasAttribute("data-outside")).toBe(true);
    pointer("pointerup", element, 500, yAt("10:37"));
    stop();

    expect(proposals).toEqual([]);
    expect(ghostsOf(grid.region, "event")).toHaveLength(0);
  });
});

describe("a free move while the view scrolls", () => {
  test("keeps the copy under the pointer and the landing box on the scrolled grid", () => {
    vi.useFakeTimers();
    const grid = mountTimeGrid([meeting]);
    const element = grid.elements.get("a")!;
    let scrollTop = 0;
    // The grid scrolls: its cells and events move up as the container scrolls down.
    for (const node of grid.region.querySelectorAll<HTMLElement>("[data-date], [data-event-id]")) {
      const fixed = node.getBoundingClientRect.bind(node);
      node.getBoundingClientRect = () => {
        const rect = fixed();
        const { height, left, width } = rect;
        const top = rect.top - scrollTop;
        return { bottom: top + height, height, left, right: left + width, top, width } as DOMRect;
      };
    }
    const container = document.createElement("div");
    container.getBoundingClientRect = () =>
      ({ bottom: 600, left: 0, right: 200, top: 0 }) as DOMRect;
    Object.defineProperty(container, "scrollTop", {
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = Math.max(0, value);
      },
    });
    const proposals = setup(grid, { preview: "free", scrollContainer: { current: container } });

    pointer("pointerdown", element, 50, yAt("09:30"));
    pointer("pointermove", element, 50, 590);
    for (let frame = 0; frame < 10; frame += 1) vi.advanceTimersToNextFrame();
    expect(scrollTop).toBeGreaterThan(0);

    const [clone] = ghostsOf(grid.region, "event");
    expect(translation(clone!)).toEqual([0, yAt("09:00") + 590 - yAt("09:30")]);
    const [landing] = ghostsOf(grid.region, "landing");
    const [, landingTop] = translation(landing!);

    pointer("pointerup", element, 50, 590);
    const proposal = proposals[0];
    expect(proposal?.cause).toBe("move");
    const start = proposal!.cause === "move" ? proposal!.proposed.start : null;
    const time = (start as Temporal.Instant).toZonedDateTimeISO(timeZone).toPlainTime().toString();
    expect(landingTop).toBeCloseTo(yAt(time) - scrollTop);
  });
});

describe("a free resize", () => {
  test("draws the dragged edge under the pointer and proposes the snapped end", () => {
    const steps: readonly Step[] = [
      ["pointerdown", 50, yAt("09:58")],
      ["pointermove", 50, yAt("10:40")],
      ["pointermove", 50, yAt("11:07")],
      ["pointerup", 50, yAt("11:07")],
    ];
    const handle = (view: ReturnType<typeof mountTimeGrid>) =>
      view.elements.get("a")!.querySelector<HTMLElement>('[data-resize="end"]')!;
    const runs = (["snapped", "free"] as const).map((preview) => {
      const view = mountTimeGrid([meeting]);
      return record(view, () => handle(view), steps, { preview });
    });
    expect(runs[0]!.proposals).toEqual(["timed 2026-08-17T09:00:00Z/2026-08-17T11:00:00Z"]);
    expect(runs[1]).toEqual(runs[0]);

    const grid = mountTimeGrid([meeting]);
    withTime(grid.elements.get("a")!);
    setup(grid, { preview: "free" });
    pointer("pointerdown", handle(grid), 50, yAt("09:58"));
    pointer("pointermove", handle(grid), 50, yAt("11:07"));

    const [clone] = ghostsOf(grid.region, "event");
    // 09:58 to 11:07 is 69 minutes on from the end at 10:00.
    expect(box(clone!).top).toBe(yAt("09:00"));
    expect(box(clone!).height).toBeCloseTo(hour(129));
    expect(clone!.querySelector("[data-event-time]")!.textContent).toMatch(/^9:00\s–\s11:00\sAM$/u);
    const [landing] = ghostsOf(grid.region, "landing");
    expect(box(landing!).height).toBeCloseTo(hour(120));
  });

  test("never draws the event shorter than one slot", () => {
    const grid = mountTimeGrid([meeting]);
    const handle = grid.elements.get("a")!.querySelector<HTMLElement>('[data-resize="end"]')!;
    setup(grid, { preview: "free" });
    pointer("pointerdown", handle, 50, yAt("09:58"));
    pointer("pointermove", handle, 50, yAt("08:00"));
    expect(box(ghostsOf(grid.region, "event")[0]!).height).toBeCloseTo(hour(15));
  });

  test("slides onto the snapped edge on release", () => {
    vi.useFakeTimers();
    const grid = mountTimeGrid([meeting]);
    const handle = grid.elements.get("a")!.querySelector<HTMLElement>('[data-resize="end"]')!;
    const proposals = setup(grid, { preview: "free" });
    pointer("pointerdown", handle, 50, yAt("09:58"));
    pointer("pointermove", handle, 50, yAt("11:07"));
    pointer("pointerup", handle, 50, yAt("11:07"));

    expect(proposals).toHaveLength(1);
    const [clone] = ghostsOf(grid.region, "event");
    expect(clone!.style.transition).toContain("height");
    expect(box(clone!).height).toBeCloseTo(hour(120));
    vi.advanceTimersByTime(200);
    expect(ghostsOf(grid.region, "event")).toHaveLength(0);
  });
});

describe("a free create", () => {
  test("grows its range with the pointer and proposes the snapped one", () => {
    const steps: readonly Step[] = [
      ["pointerdown", 50, yAt("14:05")],
      ["pointermove", 50, yAt("14:40")],
      ["pointermove", 50, yAt("15:10")],
      ["pointerup", 50, yAt("15:10")],
    ];
    const column = (view: ReturnType<typeof mountTimeGrid>) =>
      view.region.querySelector<HTMLElement>('[data-date="2026-08-17"]:not([data-all-day])')!;
    const runs = (["snapped", "free"] as const).map((preview) => {
      const view = mountTimeGrid([]);
      return record(view, () => column(view), steps, { preview });
    });
    expect(runs[0]!.proposals).toEqual(["timed 2026-08-17T14:00:00Z/2026-08-17T15:15:00Z"]);
    expect(runs[1]).toEqual(runs[0]);

    const grid = mountTimeGrid([]);
    setup(grid, { preview: "free" });
    pointer("pointerdown", column(grid), 50, yAt("14:05"));
    pointer("pointermove", column(grid), 50, yAt("15:10"));
    const [range] = ghostsOf(grid.region, "range");
    expect(box(range!).top).toBe(yAt("14:00"));
    expect(box(range!).height).toBeCloseTo(hour(70));
    expect(box(ghostsOf(grid.region, "landing")[0]!).height).toBeCloseTo(hour(75));

    // Above where it started, it runs from the pointer to the end of the first slot.
    pointer("pointermove", column(grid), 50, yAt("13:20"));
    expect(box(ghostsOf(grid.region, "range")[0]!).top).toBeCloseTo(yAt("13:20"));
    expect(box(ghostsOf(grid.region, "range")[0]!).height).toBeCloseTo(hour(55));
  });
});

describe("a snapped drag", () => {
  test("is the default and draws no landing boxes", () => {
    const grid = mountTimeGrid([meeting]);
    const element = grid.elements.get("a")!;
    setup(grid);
    pointer("pointerdown", element, 50, yAt("09:30"));
    pointer("pointermove", element, 150, yAt("10:37"));
    expect(ghostsOf(grid.region, "landing")).toHaveLength(0);
    expect(translation(ghostsOf(grid.region, "event")[0]!)).toEqual([100, yAt("10:00")]);
  });
});
