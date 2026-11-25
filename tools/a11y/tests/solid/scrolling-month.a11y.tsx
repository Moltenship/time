import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEvent,
} from "@moltenship/calendar-solid";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vite-plus/test";
import { cdp, page, server } from "vite-plus/test/browser";

import { CalendarToolbar } from "@registry/calendar/calendar-toolbar";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import { createScrollingMonthView } from "@registry/scrolling-month-view/scrolling-month-view";

import { seriousViolations, setTheme, themes } from "../axe";
import {
  monthAnchor,
  monthAvailability,
  monthEvents,
  monthNow,
  monthWeekRules,
} from "../month-fixture";
import { describeTree } from "../kit-twins";
import scrollingMonth from "../view-twins/scrolling-month.txt?raw";
import { atRest, inWebKit, press, render, settled, until } from "./render";

// The Solid registry's scrolling month in a real browser, against what React's files check
// (scrolling-twins, scrolling-views, scrolling-axis-lock, rtl-layout, phone-layout and
// reduced-motion): it renders React's scrolling month, passes axe in both themes, swipes a month at
// a time, keys cross the edge of the weeks it shows, a long scroll keeps only the weeks around the
// view rendered, a finger's swipe pages it on one axis only, and reduced motion jumps.

type Fixture = CalendarEvent<{ readonly color: CalendarEventColor }, string>;

const Calendar = createCalendar<Fixture>()({
  eventAdapter: createCanonicalEventAdapter<{ readonly color: CalendarEventColor }, string>(),
  views: [createScrollingMonthView<Fixture>({ getEventColor: (event) => event.data.color })],
});

let actions: ReturnType<typeof Calendar.useCalendarActions> | undefined;
let anchors: Temporal.PlainDate[] = [];

afterEach(() => {
  anchors = [];
  actions = undefined;
});

function CaptureActions() {
  actions = Calendar.useCalendarActions();
  return null;
}

/** The scrolling month under the toolbar, from Thursday October 8, 2026, with Monday-first weeks. */
function Screen(props: { readonly dir?: "ltr" | "rtl"; readonly toolbar?: boolean }) {
  return (
    <Calendar.Root
      availability={monthAvailability}
      defaultAnchorDate={monthAnchor}
      defaultTimeZone="UTC"
      defaultView="scrolling-month"
      direction={props.dir ?? "ltr"}
      events={monthEvents}
      locale="en-US"
      now={monthNow}
      onAnchorDateChange={(date) => anchors.push(date)}
      onEventChange={() => {}}
      weekRules={monthWeekRules}
    >
      <CaptureActions />
      <Calendar.Frame class="flex h-dvh flex-col" dir={props.dir ?? "ltr"}>
        {props.toolbar === false ? null : <CalendarToolbar calendar={Calendar} class="border-b" />}
        <Calendar.Viewport class="min-h-0 flex-1">
          <Calendar.ActiveView />
        </Calendar.Viewport>
      </Calendar.Frame>
    </Calendar.Root>
  );
}

const grid = () => document.querySelector<HTMLElement>('[data-slot="scrolling-month"]')!;
const scroller = () =>
  document.querySelector<HTMLElement>('[data-slot="scrolling-month-viewport"]')!;
const title = () => document.querySelector('[data-calendar-part="title"]')?.textContent;
const lanesMeasured = () =>
  until(() => expect(grid().querySelector('[aria-label*=" more events on "]')).not.toBeNull());
const weekRows = () => [...scroller().querySelectorAll<HTMLElement>('[role="row"]')];
const visibleRows = () => weekRows().filter((row) => row.closest('[aria-hidden="true"]') === null);

/** One week row's height, from the spread of the rows, without the rounding of any one of them. */
function weekSize() {
  const tops = weekRows().map((row) => row.getBoundingClientRect().top);
  return (tops.at(-1)! - tops[0]!) / (tops.length - 1);
}

/** Weeks from 1970 to the top of the view, by the week row there, as React's file measures. */
function position() {
  const { top } = scroller().getBoundingClientRect();
  const row = weekRows().find((candidate) => candidate.getBoundingClientRect().bottom > top + 0.5)!;
  const bounds = row.getBoundingClientRect();
  const date = Temporal.PlainDate.from(
    row.querySelector("[data-date]")!.getAttribute("data-date")!,
  );
  const week = Math.floor(Temporal.PlainDate.from("1970-01-01").until(date).days / 7);
  return week + (top - bounds.top) / bounds.height;
}

/** Moves the view `weeks` on and leaves it there, as a drag let go there does. */
async function dragBy(weeks: number) {
  scroller().scrollTo({ behavior: "instant", top: scroller().scrollTop + weeks * weekSize() });
  await settled();
}

/** Scrolls by `weeks`, as a wheel's step does: snapping carries it on to the next page. */
async function scrollBy(weeks: number) {
  scroller().scrollBy({ behavior: "instant", top: weeks * weekSize() });
  await settled();
}

const near = (value: number, expected: number) =>
  expect(Math.abs(value - expected)).toBeLessThan(0.05);

// The descriptions are Chromium's: another engine serializes some attributes its own way.
describe.runIf(server.browser === "chromium")("the Solid scrolling month renders React's", () => {
  test("the weeks around October 2026", async () => {
    await render(() => <Screen toolbar={false} />);
    await lanesMeasured();
    await atRest(scroller());
    expect(describeTree(grid())).toBe(scrollingMonth);
  });
});

describe.each(themes)("the Solid scrolling month, %s theme", (theme) => {
  test("has no serious violations", async () => {
    setTheme(theme);
    await render(() => <Screen />);
    await lanesMeasured();
    expect(await seriousViolations()).toEqual([]);
  });
});

describe("the Solid scrolling month", () => {
  test("shows six weeks from the week of its month's first day, a page each side for scrolling", async () => {
    await render(() => <Screen />);
    expect(title()).toBe("October 2026");
    expect(
      visibleRows().map((row) => row.querySelector("[data-date]")!.getAttribute("data-date")),
    ).toEqual(["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02"]);
    expect(weekRows().length).toBeGreaterThan(6);
    // One tab stop, in the visible weeks.
    const stops = grid().querySelectorAll('[tabindex="0"]');
    expect(stops).toHaveLength(1);
    expect(stops[0]!.closest('[aria-hidden="true"]')).toBeNull();
  });

  // Under load, WebKit sometimes doesn't carry a programmatic step on to the next snap point, as in
  // React's file: #181.
  test.skipIf(inWebKit)("swipes a month at a time", async () => {
    await render(() => <Screen />);
    await atRest(scroller());
    const start = position();

    // Past halfway to November, whose first row is four weeks on.
    await dragBy(2.5);
    await until(() => expect(title()).toBe("November 2026"));
    expect(anchors.map(String)).toEqual(["2026-11-01"]);
    await until(() => near(position(), start + 4));

    // Short of halfway to December, it comes back.
    await dragBy(1.5);
    await until(() => near(position(), start + 4));

    // A step, as a wheel makes, goes on to December, five weeks on.
    await scrollBy(1);
    await until(() => expect(title()).toBe("December 2026"));
    await until(() => near(position(), start + 9));
  });

  test("Next and Today scroll to their range", async () => {
    await render(() => <Screen />);
    await atRest(scroller());
    const start = position();

    document.querySelector<HTMLElement>('[aria-label="Next period"]')!.click();
    await settled();
    expect(title()).toBe("November 2026");
    await until(() => near(position(), start + 4));

    document.querySelector<HTMLElement>('[aria-label="Today"]')!.click();
    await settled();
    expect(title()).toBe("October 2026");
    await until(() => near(position(), start));
  });

  test("a long scroll renders only the weeks around the view as it passes months", async () => {
    await render(() => <Screen />);
    await atRest(scroller());
    const start = position();
    const rendered = weekRows().length;

    for (let step = 0; step < 6; step += 1) {
      await scrollBy(4.5);
      await atRest(scroller());
    }

    await until(() => expect(title()).toBe("April 2027"));
    expect(anchors.at(-1)?.toString()).toBe("2027-04-01");
    expect(position() - start).toBeGreaterThan(20);
    expect(weekRows().length).toBe(rendered);
    expect(visibleRows()).toHaveLength(6);
    // The weeks rendered are those around April, and the tab stop moved into them.
    const dates = weekRows().map((row) =>
      row.querySelector("[data-date]")!.getAttribute("data-date")!,
    );
    expect(dates.includes("2026-10-05")).toBe(false);
    expect(grid().querySelectorAll('[tabindex="0"]')).toHaveLength(1);
  });

  test("a jump to a far month lands on it", async () => {
    await render(() => <Screen />);
    await atRest(scroller());

    actions!.setAnchorDate(Temporal.PlainDate.from("2031-03-07"));
    await settled();
    await atRest(scroller());

    expect(title()).toBe("March 2031");
    const top = visibleRows()[0]!.getBoundingClientRect().top;
    expect(Math.abs(top - scroller().getBoundingClientRect().top)).toBeLessThan(1);
  });
});

describe("the Solid scrolling month's keyboard across the edge of its weeks", () => {
  const focused = () => document.activeElement?.getAttribute("aria-label") ?? "";

  test("arrows and Page keys move past the visible weeks, and focus follows into view", async () => {
    await render(() => <Screen />);
    await atRest(scroller());
    grid().querySelector<HTMLElement>('[role="gridcell"][tabindex="0"]')!.focus();
    await settled();
    expect(focused()).toMatch(/^Thursday, October 8, 2026/);

    // Four weeks on is the last visible week; one more is past it, in November's page.
    for (let step = 0; step < 4; step += 1) await press("ArrowDown");
    expect(title()).toBe("October 2026");
    expect(focused()).toMatch(/^Thursday, November 5, 2026/);
    await press("ArrowDown");
    expect(title()).toBe("November 2026");
    expect(focused()).toMatch(/^Thursday, November 12, 2026/);

    await press("PageDown");
    expect(title()).toBe("December 2026");
    expect(focused()).toMatch(/^Saturday, December 12, 2026/);
    await atRest(scroller());

    // Focus is on a visible week, the only tab stop, inside the scroller's box.
    const cell = document.activeElement!;
    expect(cell.closest('[aria-hidden="true"]')).toBeNull();
    expect(cell.getAttribute("tabindex")).toBe("0");
    expect(grid().querySelectorAll('[tabindex="0"]')).toHaveLength(1);
    const box = scroller().getBoundingClientRect();
    const { bottom, top } = cell.getBoundingClientRect();
    expect(top >= box.top - 1 && bottom <= box.bottom + 1).toBe(true);

    // Back across the edge the other way.
    await press("PageUp");
    await press("PageUp");
    expect(title()).toBe("October 2026");
    expect(focused()).toMatch(/^Monday, October 12, 2026/);
    await press("ArrowUp");
    await press("ArrowUp");
    await press("ArrowUp");
    expect(title()).toBe("September 2026");
    expect(focused()).toMatch(/^Monday, September 21, 2026/);
  });
});

describe.each(["ltr", "rtl"] as const)("the Solid scrolling month, %s", (dir) => {
  const px = (value: number) => Math.round(value) + 0;

  test("days follow the reading order, and the weeks still swipe on the block axis", async () => {
    await render(() => <Screen dir={dir} />);
    const cell = (date: string) =>
      grid()
        .querySelector<HTMLElement>(`[data-date="${date}"]`)!
        .closest<HTMLElement>('[role="gridcell"]')!
        .getBoundingClientRect();
    const [monday, tuesday] = [cell("2026-10-12"), cell("2026-10-13")];
    expect(px(dir === "ltr" ? tuesday.left - monday.right : monday.left - tuesday.right)).toBe(0);
    expect(scroller().scrollWidth).toBe(scroller().clientWidth);

    document.querySelector<HTMLElement>('[aria-label="Next period"]')!.click();
    await settled();
    await atRest(scroller());
    expect(title()).toBe("November 2026");
    expect(Math.abs(scroller().scrollLeft)).toBe(0);
  });
});

/** Where a point of the test's frame is on the page, for CDP's input. */
function onPage([x, y]: readonly [number, number]) {
  const frame = window.frameElement;
  if (frame === null) return { x, y };
  const box = frame.getBoundingClientRect();
  const scale = box.width / (frame as HTMLElement).offsetWidth;
  return { x: box.left + x * scale, y: box.top + y * scale };
}

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

// A phone's touch screen needs Chromium's touch emulation through CDP.
describe.runIf(server.browser === "chromium")("a finger on a phone's Solid scrolling month", () => {
  beforeAll(async () => {
    await page.viewport(375, 667);
    await cdp().send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  });
  afterAll(async () => {
    await cdp().send("Emulation.setTouchEmulationEnabled", { enabled: false });
    await page.viewport(1280, 800);
  });

  test("the weeks scroll in one element, on the block axis alone", async () => {
    await render(() => <Screen />);
    const scrollers = [grid(), ...grid().querySelectorAll("*")].filter(
      (element) => scrolls(element, "x") || scrolls(element, "y"),
    );
    expect(scrollers).toEqual([scroller()]);
    expect([scrolls(scroller(), "x"), scrolls(scroller(), "y")]).toEqual([false, true]);
    expect(getComputedStyle(scroller()).overscrollBehaviorY).toBe("contain");
  });

  test.each([
    [0, -300, "November 2026"],
    [60, -300, "November 2026"],
    [-60, 300, "September 2026"],
  ])("a swipe by %i, %i pages the month", async (dx, dy, month) => {
    await render(() => <Screen />);
    await atRest(scroller());
    const box = scroller().getBoundingClientRect();

    await swipe([box.left + box.width / 2, box.top + box.height / 2], [dx, dy]);
    await atRest(scroller());

    await until(() => expect(title()).toBe(month));
    expect(scroller().scrollLeft).toBe(0);
  });

  test("a sideways swipe leaves the month where it is", async () => {
    await render(() => <Screen />);
    await atRest(scroller());
    const start = position();
    const box = scroller().getBoundingClientRect();

    await swipe([box.left + box.width - 40, box.top + box.height / 2], [-260, 0]);
    await atRest(scroller());

    expect(title()).toBe("October 2026");
    near(position(), start);
    expect(anchors).toEqual([]);
  });
});

describe.runIf(server.browser === "chromium")(
  "the Solid scrolling month with reduced motion",
  () => {
    beforeAll(async () => {
      await cdp().send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-motion", value: "reduce" }],
      });
    });
    afterAll(async () => {
      await cdp().send("Emulation.setEmulatedMedia", { features: [] });
    });

    test("Next jumps to its month instead of scrolling there", async () => {
      expect(matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(true);
      await render(() => <Screen />);
      await atRest(scroller());
      const start = position();

      document.querySelector<HTMLElement>('[aria-label="Next period"]')!.click();
      await settled();

      expect(title()).toBe("November 2026");
      near(position(), start + 4);
    });
  },
);
