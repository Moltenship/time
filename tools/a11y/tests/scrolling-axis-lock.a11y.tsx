import { act } from "react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vite-plus/test";
import { cdp, page, server } from "vite-plus/test/browser";

import { atRest, inWebKit, nextFrame, press, render, until } from "./render";
import { axis, reported, ScrollingScreen as Screen, title } from "./scrolling-screen";

// Safari on iOS locks a swipe to one direction only between nested scrollers, each scrolling one
// way: in an element that scrolls both ways, a swipe down could also page the days (#260). No
// browser here runs iOS's scrolling, so these check the layout that gives it the lock, and what
// the swipes and drags do in it.

afterEach(() => {
  reported.anchors = [];
  reported.changes = [];
  reported.ranges = [];
});

/** Whether an element scrolls along an axis, by the user or a script. */
function scrolls(element: Element, direction: "x" | "y") {
  const style = getComputedStyle(element);
  const overflow = direction === "x" ? style.overflowX : style.overflowY;
  const [content, box] =
    direction === "x"
      ? [element.scrollWidth, element.clientWidth]
      : [element.scrollHeight, element.clientHeight];
  return /auto|scroll/u.test(overflow) && content > box;
}

/** Each day header's offset from its day's column: none while they line up. */
function headerDrift() {
  const header = document.querySelector('[data-slot="scrolling-time-grid-header"]')!;
  // The first column header names the gutter.
  const headers = [...header.querySelectorAll('[role="columnheader"]')].slice(1);
  const columns = [
    ...document.querySelectorAll('[data-slot="scrolling-time-grid-days"] [role="gridcell"]'),
  ];
  expect(headers).toHaveLength(columns.length);
  return Math.max(
    ...headers.map((cell, index) =>
      Math.abs(cell.getBoundingClientRect().left - columns[index]!.getBoundingClientRect().left),
    ),
  );
}

describe.each(["ltr", "rtl"] as const)("scrolling time grids, %s", (dir) => {
  test.each(["scrolling-day", "scrolling-3-day", "scrolling-week"] as const)(
    "the %s view scrolls the hours and the days in separate elements",
    async (view) => {
      await render(<Screen dir={dir} view={view} />);
      const grid = document.querySelector('[data-slot="scrolling-time-grid"]')!;
      const { hours, scroller } = axis(view);

      expect([scrolls(hours!, "x"), scrolls(hours!, "y")]).toEqual([false, true]);
      expect([scrolls(scroller, "x"), scrolls(scroller, "y")]).toEqual([true, false]);
      expect(getComputedStyle(scroller).overflowY).toBe("hidden");
      expect(getComputedStyle(hours!).overflowX).toBe("hidden");
      // A sideways swipe over the header or the hour labels doesn't go back a page in the browser.
      expect(getComputedStyle(hours!).overscrollBehaviorX).toBe("contain");
      // Nothing else scrolls, and nothing scrolls both ways.
      const scrollers = [grid, ...grid.querySelectorAll("*")].filter(
        (element) => scrolls(element, "x") || scrolls(element, "y"),
      );
      expect(scrollers).toEqual([hours, scroller]);
    },
  );
});

test("the hours open on the current time, in the element that scrolls them", async () => {
  await render(<Screen view="scrolling-day" />);
  const { hours, scroller } = axis("scrolling-day");
  const header = document.querySelector<HTMLElement>('[data-slot="scrolling-time-grid-header"]')!;
  // Now is 10:20, a third of the way down the hours in view below the header. The days' element is
  // the 24 hours tall.
  const now = (scroller.getBoundingClientRect().height * (10 + 1 / 3)) / 24;
  await until(() => expect(hours!.scrollTop).toBeGreaterThan(0));
  const third = (hours!.clientHeight - header.offsetHeight) / 3;
  expect(Math.abs(now - hours!.scrollTop - third)).toBeLessThan(2);
});

// Chromium and WebKit here have scroll timelines; Firefox, and Safari before 26, follow scroll
// events instead.
describe.each([
  ["a scroll timeline", false],
  ["scroll events", true],
] as const)("the header following %s", (_, fallback) => {
  beforeEach(() => {
    if (fallback) vi.stubGlobal("ScrollTimeline", undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("the header's days follow a scroll timeline where the browser has them", async () => {
    await render(<Screen view="scrolling-3-day" />);
    const header = document.querySelector('[data-slot="scrolling-time-grid-header"]')!;
    const animated = (selector: string) =>
      [...header.querySelectorAll(selector)].flatMap((element) =>
        element.getAnimations().map(({ timeline }) => timeline?.constructor.name),
      );
    const timelines = !fallback && typeof ScrollTimeline === "function";

    // The day names and the all-day row, and the title of the trip, whose start can scroll away.
    expect(animated('[role="row"] > .overflow-clip > *')).toEqual(
      timelines ? ["ScrollTimeline", "ScrollTimeline"] : [],
    );
    expect(animated('[data-event-id="trip"] [data-slot="calendar-event-title"]')).toEqual(
      timelines ? ["ScrollTimeline"] : [],
    );
  });

  test("keys moving focus from the header to the next page keep the header on the days", async () => {
    await render(<Screen view="scrolling-3-day" />);
    const { scroller } = axis("scrolling-3-day");
    await atRest(scroller);
    const header = document.querySelector('[data-slot="scrolling-time-grid-header"]')!;
    // The all-day cell of the last day shown.
    const cell = header
      .querySelector('[data-date="2026-10-09"]')!
      .closest<HTMLElement>('[role="gridcell"]')!;
    await act(async () => cell.focus());

    await press("ArrowRight");
    await atRest(scroller);

    expect(title()).toBe("Oct 10 – 12, 2026");
    expect(header.contains(document.activeElement)).toBe(true);
    expect(headerDrift()).toBeLessThan(1);
  });

  describe.each(["ltr", "rtl"] as const)("%s", (dir) => {
    test("an all-day bar's title stays on screen as its start scrolls away", async () => {
      await render(<Screen dir={dir} view="scrolling-3-day" />);
      const { scroller } = axis("scrolling-3-day");
      await atRest(scroller);
      // The trip runs from Monday the 12th to Thursday the 15th.
      const trip = () =>
        document.querySelector<HTMLElement>(
          '[data-slot="scrolling-time-grid-header"] [data-event-id="trip"]',
        )!;
      const label = () =>
        trip().querySelector('[data-slot="calendar-event-title"]')!.getBoundingClientRect();
      /** How far the title is in from the start of the days on screen, along the inline axis. */
      const inFromStart = () => {
        const days = scroller.getBoundingClientRect();
        return dir === "rtl" ? days.right - label().right : label().left - days.left;
      };
      const next = () =>
        act(async () => document.querySelector<HTMLElement>('[aria-label="Next period"]')!.click());

      // October 10 to 12: the bar starts on the third day, and its title with it.
      await next();
      await atRest(scroller);
      const start = trip().getBoundingClientRect();
      expect(
        Math.abs(
          (dir === "rtl" ? start.right : start.left) -
            (dir === "rtl" ? label().right : label().left),
        ),
      ).toBeLessThan(20);

      // On to October 13: the bar's start scrolls away, and the title stays on screen every frame.
      await next();
      let frames = 0;
      while (title() !== "Oct 13 – 15, 2026" || frames < 30) {
        await nextFrame();
        expect(inFromStart()).toBeGreaterThan(-1);
        frames += 1;
        if (frames > 600) throw new Error("the page never came to rest");
      }
      await atRest(scroller);
      // Half a rem in from the start of the days.
      expect(Math.abs(inFromStart() - 8)).toBeLessThan(1.5);
    });

    test("the header stays on the days as they scroll a page", async () => {
      await render(<Screen dir={dir} view="scrolling-3-day" />);
      const { position, scroller } = axis("scrolling-3-day");
      // The header's animations start on the frame after the view mounts.
      await atRest(scroller);
      const start = position();
      expect(headerDrift()).toBeLessThan(1);

      // Next scrolls smoothly; the header keeps up every frame of the way.
      await act(async () =>
        document.querySelector<HTMLElement>('[aria-label="Next period"]')!.click(),
      );
      let frames = 0;
      while (Math.abs(position() - start - 3) >= 0.05) {
        await nextFrame();
        expect(headerDrift()).toBeLessThan(1);
        frames += 1;
        if (frames > 600) throw new Error("the page never came to rest");
      }
      await atRest(scroller);
      expect(title()).toBe("Oct 10 – 12, 2026");
      expect(headerDrift()).toBeLessThan(1);

      // A scroll that stops between pages, before it settles back.
      await axis("scrolling-3-day").dragBy(0.4, dir);
      expect(headerDrift()).toBeLessThan(1);
      await atRest(scroller);
      expect(headerDrift()).toBeLessThan(1);
    });
  });
});

// In WebKit the drag doesn't carry the view on; why isn't known yet: #181.
test.skipIf(inWebKit)(
  "a drag held at the bottom scrolls the hours, and the days stay",
  async () => {
    await render(<Screen view="scrolling-3-day" />);
    const { hours, position, scroller } = axis("scrolling-3-day");
    await atRest(scroller);
    const start = { days: position(), hours: hours!.scrollTop };
    const event = scroller.querySelector<HTMLElement>('[data-event-id="planning"]')!;
    const box = event.getBoundingClientRect();
    const bottom = hours!.getBoundingClientRect().bottom - 10;
    const at = (y: number) => ({
      bubbles: true,
      button: 0,
      clientX: box.left + 10,
      clientY: y,
      isPrimary: true,
      pointerId: 1,
      pointerType: "mouse",
    });

    await act(async () => {
      event.dispatchEvent(new PointerEvent("pointerdown", at(box.top + 10)));
      event.dispatchEvent(new PointerEvent("pointermove", at(box.top + 30)));
      event.dispatchEvent(new PointerEvent("pointermove", at(bottom)));
    });
    try {
      await until(() => expect(hours!.scrollTop).toBeGreaterThan(start.hours + 100));
      expect(Math.abs(position() - start.days)).toBeLessThan(0.01);
    } finally {
      await act(async () =>
        document
          .elementFromPoint(box.left + 10, bottom)!
          .dispatchEvent(new PointerEvent("pointerup", at(bottom))),
      );
    }
    // Still on Thursday the 8th, later in the day.
    const proposed = reported.changes[0]?.proposed?.start as Temporal.Instant | undefined;
    expect(proposed?.toZonedDateTimeISO("UTC").toPlainDate().toString()).toBe("2026-10-08");
    expect(reported.anchors).toEqual([]);
  },
);

function onPage([x, y]: readonly [number, number]) {
  const frame = window.frameElement;
  if (frame === null) return { x, y };
  const box = frame.getBoundingClientRect();
  const scale = box.width / (frame as HTMLElement).offsetWidth;
  return { x: box.left + x * scale, y: box.top + y * scale };
}

/** A finger on the touch screen, through Chromium's own input pipeline. */
async function touch(
  type: "touchEnd" | "touchMove" | "touchStart",
  at?: readonly [number, number],
) {
  await cdp().send("Input.dispatchTouchEvent", {
    touchPoints: at === undefined ? [] : [{ id: 1, ...onPage(at) }],
    type,
  });
}

/** A finger's swipe from `from`, `by` along each axis, in small steps as a finger moves. */
async function swipe(from: readonly [number, number], by: readonly [number, number]) {
  const steps = 30;
  await touch("touchStart", from);
  try {
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      await touch("touchMove", [from[0] + by[0] * t, from[1] + by[1] * t]);
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
  } finally {
    await touch("touchEnd");
  }
}

// Chromium rails a swipe on its own, in one scroller as in two, so these pass in the old layout
// too; they check that the two scrollers still scroll and page a finger's swipes as before.
describe.runIf(server.browser === "chromium")("a finger on a phone's 3-day view", () => {
  beforeAll(async () => {
    await page.viewport(375, 667);
    await cdp().send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  });
  // The page outlives this file: the next file in it gets a mouse again, and its own size.
  afterAll(async () => {
    await cdp().send("Emulation.setTouchEmulationEnabled", { enabled: false });
    await page.viewport(1280, 800);
  });

  test.each([
    [0, -300],
    [60, -300],
    [-60, 300],
  ])("a swipe by %i, %i scrolls the hours, and the days stay", async (dx, dy) => {
    await render(<Screen view="scrolling-3-day" />);
    const { hours, position, scroller } = axis("scrolling-3-day");
    await atRest(scroller);
    const start = { days: position(), hours: hours!.scrollTop };
    const box = scroller.getBoundingClientRect();

    await swipe([box.left + box.width / 2, 400], [dx, dy]);
    await atRest(hours!);
    await atRest(scroller);

    expect(Math.abs(hours!.scrollTop - start.hours)).toBeGreaterThan(200);
    expect(Math.abs(position() - start.days)).toBeLessThan(0.01);
    expect(title()).toBe("Oct 7 – 9, 2026");
  });

  test.each([
    [-200, 0, "Oct 10 – 12, 2026"],
    [-200, 60, "Oct 10 – 12, 2026"],
    [200, -60, "Oct 4 – 6, 2026"],
  ])("a swipe by %i, %i pages the days, and the hours stay", async (dx, dy, page) => {
    await render(<Screen view="scrolling-3-day" />);
    const { hours, scroller } = axis("scrolling-3-day");
    await atRest(scroller);
    const start = hours!.scrollTop;
    const box = scroller.getBoundingClientRect();

    await swipe([box.left + box.width / 2, 400], [dx, dy]);
    await atRest(scroller);

    await until(() => expect(title()).toBe(page));
    expect(hours!.scrollTop).toBe(start);
    expect(headerDrift()).toBeLessThan(1);
  });
});

/** A mouse wheel's or trackpad's scroll at a point, through Chromium's own input pipeline. */
async function wheel([x, y]: readonly [number, number], deltaX: number, deltaY: number) {
  await cdp().send("Input.dispatchMouseEvent", {
    ...onPage([x, y]),
    deltaX,
    deltaY,
    type: "mouseWheel",
  });
}

describe.runIf(server.browser === "chromium")("a wheel over the days", () => {
  test("down scrolls the hours, and the days stay", async () => {
    await render(<Screen view="scrolling-week" />);
    const { hours, position, scroller } = axis("scrolling-week");
    await atRest(scroller);
    const start = { days: position(), hours: hours!.scrollTop };
    const box = scroller.getBoundingClientRect();
    // Over the hours in view, below the header.
    const at = [box.left + box.width / 2, hours!.getBoundingClientRect().bottom - 150] as const;

    await wheel(at, 0, 300);
    await until(() => expect(hours!.scrollTop).toBeGreaterThan(start.hours + 100));
    await atRest(scroller);

    expect(Math.abs(position() - start.days)).toBeLessThan(0.01);
  });

  test("sideways pages the days, and the hours stay", async () => {
    await render(<Screen view="scrolling-week" />);
    const { hours, scroller } = axis("scrolling-week");
    await atRest(scroller);
    const start = hours!.scrollTop;
    const box = scroller.getBoundingClientRect();
    const at = [box.left + box.width / 2, hours!.getBoundingClientRect().bottom - 150] as const;

    // A trackpad's flick: a small step snaps back to the week, as it did in one scroller.
    await wheel(at, 800, 0);

    await until(() => expect(title()).toBe("Oct 12 – 18, 2026"));
    await atRest(scroller);
    expect(hours!.scrollTop).toBe(start);
    expect(headerDrift()).toBeLessThan(1);
  });
});
