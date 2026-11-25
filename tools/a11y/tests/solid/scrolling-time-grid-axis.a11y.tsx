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

import { nextFrame } from "../waits";
import { atRest, inWebKit, press, render, settled, until } from "./render";
import {
  axis,
  clearReported,
  headerDrift,
  near,
  pointerAt,
  reported,
  ScrollingScreen as Screen,
  title,
  toolbar,
} from "./scrolling-screen";

// The Solid scrolling week, 3-day and day's two axes in a real browser, against what React's
// files check (scrolling-axis-lock, scrolling-header and scrolling-views' drags): the hours and the
// days scroll in separate elements, the hours open on the current time, the header and the
// all-day row stay on the days as they scroll, with or without scroll timelines, an all-day bar's
// title stays on screen as its start scrolls away, a drag held at an edge scrolls that way, and a
// finger or a wheel scrolls one axis only.

afterEach(clearReported);

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

const header = () =>
  document.querySelector<HTMLElement>('[data-slot="scrolling-time-grid-header"]')!;

describe.each(["ltr", "rtl"] as const)("the Solid scrolling time grids, %s", (dir) => {
  test.each(["scrolling-day", "scrolling-3-day", "scrolling-week"] as const)(
    "the %s view scrolls the hours and the days in separate elements",
    async (view) => {
      await render(() => <Screen dir={dir} view={view} />);
      const grid = document.querySelector('[data-slot="scrolling-time-grid"]')!;
      const { hours, scroller } = axis();

      expect([scrolls(hours, "x"), scrolls(hours, "y")]).toEqual([false, true]);
      expect([scrolls(scroller, "x"), scrolls(scroller, "y")]).toEqual([true, false]);
      expect(getComputedStyle(scroller).overflowY).toBe("hidden");
      expect(getComputedStyle(hours).overflowX).toBe("hidden");
      // A sideways swipe over the header or the hour labels doesn't go back a page in the browser.
      expect(getComputedStyle(hours).overscrollBehaviorX).toBe("contain");
      // Nothing else scrolls, and nothing scrolls both ways.
      const scrollers = [grid, ...grid.querySelectorAll("*")].filter(
        (element) => scrolls(element, "x") || scrolls(element, "y"),
      );
      expect(scrollers).toEqual([hours, scroller]);
    },
  );
});

test("the hours open on the current time, in the element that scrolls them", async () => {
  await render(() => <Screen view="scrolling-day" />);
  const { hours, scroller } = axis();
  // Now is 10:20, a third of the way down the hours in view below the header. The days' element is
  // the 24 hours tall.
  const now = (scroller.getBoundingClientRect().height * (10 + 1 / 3)) / 24;
  await until(() => expect(hours.scrollTop).toBeGreaterThan(0));
  const third = (hours.clientHeight - header().offsetHeight) / 3;
  expect(Math.abs(now - hours.scrollTop - third)).toBeLessThan(2);
  // The now line is in today's column, and in no other.
  const line = scroller.querySelectorAll('[data-slot="time-grid-now"]');
  expect(line).toHaveLength(1);
  expect(line[0]!.closest("[data-date]")?.getAttribute("data-date")).toBe("2026-10-08");
});

test("the header's padding keeps focus in the hours clear of it", async () => {
  await render(() => <Screen view="scrolling-week" />);
  const { hours } = axis();
  await until(() =>
    expect(hours.style.getPropertyValue("--calendar-header-height")).toBe(
      `${header().offsetHeight}px`,
    ),
  );
  expect(getComputedStyle(hours).scrollPaddingTop).toBe(`${header().offsetHeight}px`);
});

const ways = [
  ["on scroll timelines", false],
  ["by scroll events", true],
] as const;

describe.each(ways)("the Solid header following %s", (_way, fallback) => {
  beforeEach(() => {
    if (fallback) vi.stubGlobal("ScrollTimeline", undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("the header's days follow a scroll timeline where the browser has them", async () => {
    await render(() => <Screen view="scrolling-3-day" />);
    await atRest(axis().scroller);
    const animated = (selector: string) =>
      [...header().querySelectorAll(selector)].flatMap((element) =>
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
    await render(() => <Screen view="scrolling-3-day" />);
    const { scroller } = axis();
    await atRest(scroller);
    // The all-day cell of the last day shown.
    header()
      .querySelector('[data-date="2026-10-09"]')!
      .closest<HTMLElement>('[role="gridcell"]')!
      .focus();
    await settled();

    await press("ArrowRight");
    await atRest(scroller);

    expect(title()).toBe("Oct 10 – 12, 2026");
    expect(header().contains(document.activeElement)).toBe(true);
    expect(headerDrift()).toBeLessThan(1);
  });

  describe.each(["ltr", "rtl"] as const)("%s", (dir) => {
    test("the header stays on the days as they scroll a page", async () => {
      await render(() => <Screen dir={dir} view="scrolling-3-day" />);
      const { position, scroller } = axis();
      // The header's animations start on the frame after the view mounts.
      await atRest(scroller);
      const start = position();
      expect(headerDrift()).toBeLessThan(1);

      // Next scrolls smoothly; the header keeps up every frame of the way. Scroll events can
      // arrive a frame late, so without timelines it may trail by as far as the days moved.
      document.querySelector<HTMLElement>('[aria-label="Next period"]')!.click();
      await settled();
      const offset = () => Math.abs(scroller.scrollLeft);
      let last = offset();
      let frames = 0;
      while (Math.abs(position() - start - 3) >= 0.05) {
        await nextFrame();
        const moved = Math.abs(offset() - last);
        last = offset();
        expect(headerDrift()).toBeLessThan(fallback ? moved + 1 : 1);
        frames += 1;
        if (frames > 600) throw new Error("the page never came to rest");
      }
      await atRest(scroller);
      expect(title()).toBe("Oct 10 – 12, 2026");
      expect(headerDrift()).toBeLessThan(1);

      // A scroll that stops between pages, before it settles back.
      await axis().dragBy(0.4, dir);
      await nextFrame();
      expect(headerDrift()).toBeLessThan(1);
      await atRest(scroller);
      expect(headerDrift()).toBeLessThan(1);
    });

    test("an all-day bar's title stays on screen as its start scrolls away", async () => {
      await render(() => <Screen dir={dir} view="scrolling-3-day" />);
      const { scroller } = axis();
      await atRest(scroller);
      // The trip runs from Monday the 12th to Thursday the 15th.
      const trip = () => header().querySelector<HTMLElement>('[data-event-id="trip"]')!;
      const label = () =>
        trip().querySelector('[data-slot="calendar-event-title"]')!.getBoundingClientRect();
      /** How far the title is in from the start of the days on screen, along the inline axis. */
      const inFromStart = () => {
        const days = scroller.getBoundingClientRect();
        return dir === "rtl" ? days.right - label().right : label().left - days.left;
      };

      // October 10 to 12: the bar starts on the third day, and its title with it.
      await toolbar("Next period");
      await atRest(scroller);
      const start = trip().getBoundingClientRect();
      expect(
        Math.abs(
          (dir === "rtl" ? start.right : start.left) -
            (dir === "rtl" ? label().right : label().left),
        ),
      ).toBeLessThan(20);

      // On to October 13: the bar's start scrolls away, and the title stays on screen every frame.
      await toolbar("Next period");
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

      // Back past halfway to October 10: the range moves mid-scroll, and the view renders again
      // while the title is pinned. It stays on screen.
      await axis().dragBy(-1.7, dir);
      frames = 0;
      while (title() !== "Oct 10 – 12, 2026" || frames < 30) {
        await nextFrame();
        expect(inFromStart()).toBeGreaterThan(-1);
        frames += 1;
        if (frames > 600) throw new Error("the page never came to rest");
      }
      await atRest(scroller);
    });

    test("a pinned bar dragged into the hours keeps its title at its copy's start", async () => {
      await render(() => <Screen dir={dir} view="scrolling-3-day" />);
      const { hours, scroller } = axis();
      // October 13 to 15: the trip started on the 12th, so its title is pinned.
      await toolbar("Next period");
      await atRest(scroller);
      await toolbar("Next period");
      await atRest(scroller);
      const bar = header().querySelector<HTMLElement>('[data-event-id="trip"]')!;
      const from = bar.getBoundingClientRect();
      // The title has moved along its bar, away from the bar's start out of view.
      const pinned = getComputedStyle(bar.querySelector('[data-slot="calendar-event-title"]')!);
      expect(pinned.transform === "none" ? 0 : new DOMMatrix(pinned.transform).m41).not.toBe(0);
      const column = scroller
        .querySelector('[role="gridcell"][data-date="2026-10-14"]')!
        .getBoundingClientRect();
      const middle = column.left + column.width / 2;
      // Over the hours on screen, well below the header.
      const below = hours.getBoundingClientRect().bottom - 150;
      // Not the page's own mouse, whose moves WebKit sends as layout changes under it.
      const at = (x: number, y: number) => pointerAt(x, y, 11);

      bar.dispatchEvent(
        new PointerEvent("pointerdown", at(from.left + from.width / 2, from.top + 5)),
      );
      bar.dispatchEvent(new PointerEvent("pointermove", at(middle, from.top + 30)));
      bar.dispatchEvent(new PointerEvent("pointermove", at(middle, below)));
      await settled();
      try {
        const copied = () => [
          ...document.querySelectorAll<HTMLElement>(
            '[data-calendar-ghost] [data-slot="calendar-event-title"]',
          ),
        ];
        await until(() => expect(copied().length).toBeGreaterThan(0));
        for (const copy of copied()) {
          expect(getComputedStyle(copy).transform).toBe("none");
          const box = copy.parentElement!.getBoundingClientRect();
          const text = copy.getBoundingClientRect();
          // At the copy's start, inside its padding, not shifted along it.
          expect(dir === "rtl" ? box.right - text.right : text.left - box.left).toBeLessThan(20);
        }
      } finally {
        window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
        await settled();
      }
    });
  });
});

describe("the Solid scrolling week's drags", () => {
  // In WebKit the drag doesn't carry the view on; why isn't known yet: #181.
  test.skipIf(inWebKit)(
    "a drag held at the bottom scrolls the hours, and the days stay",
    async () => {
      await render(() => <Screen view="scrolling-3-day" />);
      const { hours, position, scroller } = axis();
      await atRest(scroller);
      const start = { days: position(), hours: hours.scrollTop };
      const event = scroller.querySelector<HTMLElement>('[data-event-id="planning"]')!;
      const box = event.getBoundingClientRect();
      const bottom = hours.getBoundingClientRect().bottom - 10;
      const at = (y: number) => pointerAt(box.left + 10, y);

      event.dispatchEvent(new PointerEvent("pointerdown", at(box.top + 10)));
      event.dispatchEvent(new PointerEvent("pointermove", at(box.top + 30)));
      event.dispatchEvent(new PointerEvent("pointermove", at(bottom)));
      await settled();
      try {
        await until(() => expect(hours.scrollTop).toBeGreaterThan(start.hours + 100));
        near(position(), start.days, 0.01);
      } finally {
        document
          .elementFromPoint(box.left + 10, bottom)!
          .dispatchEvent(new PointerEvent("pointerup", at(bottom)));
        await settled();
      }
      // Still on Thursday the 8th, later in the day.
      const proposed = reported.changes[0]?.proposed?.start as Temporal.Instant | undefined;
      expect(proposed?.toZonedDateTimeISO("UTC").toPlainDate().toString()).toBe("2026-10-08");
      expect(reported.anchors).toEqual([]);
    },
  );

  // In WebKit the drag doesn't carry the view on; why isn't known yet: #181.
  test.skipIf(inWebKit)(
    "dragging an event against the edge carries it past the days rendered at first",
    async () => {
      await render(() => <Screen view="scrolling-week" />);
      const { hours, scroller } = axis();
      hours.scrollTop = 400;
      await settled();
      const event = scroller.querySelector<HTMLElement>('[data-event-id="planning"]')!;
      const box = event.getBoundingClientRect();
      // Deep in the auto-scroll band, clear of the scrollbar.
      const edge = scroller.getBoundingClientRect().right - 20;
      const at = (x: number) => pointerAt(x, box.top + 10);

      event.dispatchEvent(new PointerEvent("pointerdown", at(box.left + 10)));
      event.dispatchEvent(new PointerEvent("pointermove", at(box.left + 30)));
      event.dispatchEvent(new PointerEvent("pointermove", at(edge)));
      await settled();
      // Held at the edge, the drag scrolls on until the days at the edge were never rendered when
      // it began: the week of October 5 rendered September 28 to October 18.
      await until(() => {
        const last = reported.anchors.at(-1);
        expect(last !== undefined && last.since("2026-10-19").sign >= 0).toBe(true);
      });
      // The event's own element has scrolled out of the rendered days by now: the pointer is over
      // whatever is at the edge, as a real one would be.
      document
        .elementFromPoint(edge, box.top + 10)!
        .dispatchEvent(new PointerEvent("pointerup", at(edge)));
      await settled();

      const [change] = reported.changes;
      expect(change?.cause).toBe("move");
      const start = change?.proposed?.start;
      expect(start instanceof Temporal.Instant).toBe(true);
      // A timed move, landing past October 18, the last day rendered when the drag began.
      const day = (start as Temporal.Instant).toZonedDateTimeISO("UTC").toPlainDate();
      expect(Temporal.PlainDate.compare(day, Temporal.PlainDate.from("2026-10-18"))).toBe(1);
    },
  );
});

/** Where a point of the test's frame is on the page, for CDP's input. */
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

/** A finger's swipe from `from`, `by` along each axis, in steps past the browser's touch slop. */
async function swipe(from: readonly [number, number], by: readonly [number, number]) {
  const steps = 12;
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

// A phone's touch screen needs Chromium's touch emulation through CDP.
describe.runIf(server.browser === "chromium")("a finger on a phone's Solid 3-day view", () => {
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
    await render(() => <Screen view="scrolling-3-day" />);
    const { hours, position, scroller } = axis();
    await atRest(scroller);
    const start = { days: position(), hours: hours.scrollTop };
    const box = scroller.getBoundingClientRect();

    await swipe([box.left + box.width / 2, 400], [dx, dy]);
    await atRest(hours);
    await atRest(scroller);

    expect(Math.abs(hours.scrollTop - start.hours)).toBeGreaterThan(200);
    near(position(), start.days, 0.01);
    expect(title()).toBe("Oct 7 – 9, 2026");
  });

  // Past half a page of three 125 px days.
  test.each([
    [-260, 0, "Oct 10 – 12, 2026"],
    [-260, 60, "Oct 10 – 12, 2026"],
    [260, -60, "Oct 4 – 6, 2026"],
  ])("a swipe by %i, %i pages the days, and the hours stay", async (dx, dy, range) => {
    await render(() => <Screen view="scrolling-3-day" />);
    const { hours, scroller } = axis();
    await atRest(scroller);
    const start = hours.scrollTop;
    const box = scroller.getBoundingClientRect();

    await swipe([box.left + box.width / 2, 400], [dx, dy]);
    await atRest(scroller);

    await until(() => expect(title()).toBe(range));
    expect(hours.scrollTop).toBe(start);
    expect(headerDrift()).toBeLessThan(1);
  });

  test("the gutter and the days fit a phone's width, and the targets stay 24 px", async () => {
    await render(() => <Screen view="scrolling-3-day" />);
    const { hours, scroller } = axis();
    await atRest(scroller);
    expect(hours.scrollWidth).toBe(hours.clientWidth);
    const days = [...scroller.querySelectorAll('[role="gridcell"][data-date]:not([aria-hidden])')];
    expect(days).toHaveLength(3);
    const total = days.reduce((sum, day) => sum + day.getBoundingClientRect().width, 0);
    expect(Math.abs(total - scroller.clientWidth)).toBeLessThan(1);
    const planning = scroller.querySelector('[data-event-id="planning"]')!.getBoundingClientRect();
    expect(planning.width).toBeGreaterThanOrEqual(24);
    expect(planning.height).toBeGreaterThanOrEqual(24);
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

describe.runIf(server.browser === "chromium")("a wheel over the Solid scrolling week", () => {
  test("down scrolls the hours, and the days stay", async () => {
    await render(() => <Screen view="scrolling-week" />);
    const { hours, position, scroller } = axis();
    await atRest(scroller);
    const start = { days: position(), hours: hours.scrollTop };
    const box = scroller.getBoundingClientRect();
    // Over the hours in view, below the header.
    const at = [box.left + box.width / 2, hours.getBoundingClientRect().bottom - 150] as const;

    await wheel(at, 0, 300);
    await until(() => expect(hours.scrollTop).toBeGreaterThan(start.hours + 100));
    await atRest(scroller);

    near(position(), start.days, 0.01);
  });

  test("sideways pages the days, and the hours stay", async () => {
    await render(() => <Screen view="scrolling-week" />);
    const { hours, scroller } = axis();
    await atRest(scroller);
    const start = hours.scrollTop;
    const box = scroller.getBoundingClientRect();
    const at = [box.left + box.width / 2, hours.getBoundingClientRect().bottom - 150] as const;

    // A trackpad's flick.
    await wheel(at, 800, 0);

    await until(() => expect(title()).toBe("Oct 12 – 18, 2026"));
    await atRest(scroller);
    expect(hours.scrollTop).toBe(start);
    expect(headerDrift()).toBeLessThan(1);
  });
});
