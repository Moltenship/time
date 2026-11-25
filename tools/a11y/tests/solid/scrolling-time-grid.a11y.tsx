import { createCalendar, createCanonicalEventAdapter } from "@moltenship/calendar-solid";
import { createSignal } from "solid-js";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vite-plus/test";
import { cdp, server } from "vite-plus/test/browser";

import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import {
  createScrollingDayView,
  createScrollingWeekView,
} from "@registry/scrolling-time-grid-view/scrolling-time-grid-view";

import { seriousViolations, setTheme, themes } from "../axe";
import { describeScrollingLayout } from "../kit-twins";
import {
  timeGridAnchor,
  timeGridEvents,
  timeGridNow,
  timeGridWeekRules,
  type TimeGridFixture,
} from "../time-grid-fixture";
import scrollingDay from "../view-twins/scrolling-day.txt?raw";
import scrollingWeek from "../view-twins/scrolling-week.txt?raw";
import { atRest, inWebKit, press, render, settled, until } from "./render";
import {
  axis,
  clearReported,
  near,
  reported,
  screen,
  ScrollingScreen as Screen,
  spoken,
  title,
  toolbar,
} from "./scrolling-screen";

// The Solid registry's scrolling week, 3-day and day in a real browser, against what React's
// files check (scrolling-twins, scrolling-views and reduced-motion): they render React's grids,
// pass axe in both themes, swipe a page at a time either way, keep only the days around the view
// rendered, follow Next, Today and an app's anchor, page by keys past the visible days, announce a
// keyboard move, and jump with reduced motion. `scrolling-time-grid-axis.a11y.tsx` has the two
// scrolling axes, the header and the drags.

afterEach(clearReported);

const TwinCalendar = createCalendar<TimeGridFixture>()({
  eventAdapter: createCanonicalEventAdapter<{ readonly color: CalendarEventColor }, string>(),
  views: [
    createScrollingWeekView<TimeGridFixture>({
      dayView: "scrolling-day",
      getEventColor: (event) => event.data.color,
    }),
    createScrollingDayView<TimeGridFixture>({ getEventColor: (event) => event.data.color }),
  ],
});

function TwinScreen(props: { readonly view: "scrolling-day" | "scrolling-week" }) {
  return (
    <TwinCalendar.Root
      defaultAnchorDate={timeGridAnchor}
      defaultTimeZone="UTC"
      defaultView={props.view}
      events={timeGridEvents}
      locale="en-US"
      now={timeGridNow}
      onEventChange={() => {}}
      weekRules={timeGridWeekRules}
    >
      <TwinCalendar.Frame class="flex h-dvh flex-col">
        <TwinCalendar.Viewport class="min-h-0 flex-1">
          <TwinCalendar.ActiveView />
        </TwinCalendar.Viewport>
      </TwinCalendar.Frame>
    </TwinCalendar.Root>
  );
}

const grid = () => document.querySelector<HTMLElement>('[data-slot="scrolling-time-grid"]')!;

/** The first day on screen, and its offset in whole pixels from the days' inline start. */
function leading() {
  const { scroller } = axis();
  const box = scroller.getBoundingClientRect();
  const cell = scroller.querySelector<HTMLElement>(
    '[role="gridcell"][data-date]:not([aria-hidden])',
  )!;
  const { left, right } = cell.getBoundingClientRect();
  const rtl = getComputedStyle(scroller).direction === "rtl";
  return {
    date: cell.dataset.date,
    offset: Math.round(rtl ? box.right - right : left - box.left) + 0,
  };
}

// The descriptions are Chromium's: another engine serializes some attributes its own way.
describe.runIf(server.browser === "chromium")("the Solid scrolling week renders React's", () => {
  test.each([
    ["scrolling-week", scrollingWeek],
    ["scrolling-day", scrollingDay],
  ] as const)("the %s view", async (view, expected) => {
    await render(() => <TwinScreen view={view} />);
    await until(() => expect(grid().querySelector('[data-slot="time-grid-now"]')).not.toBeNull());
    await atRest(axis().scroller);
    expect(describeScrollingLayout(grid())).toBe(expected);
  });
});

describe.each(themes)("the Solid scrolling views, %s theme", (theme) => {
  test.each(["scrolling-week", "scrolling-3-day", "scrolling-day"] as const)(
    "%s has no serious violations",
    async (view) => {
      setTheme(theme);
      await render(() => <Screen view={view} />);
      await atRest(axis().scroller);
      expect(await seriousViolations()).toEqual([]);
    },
  );
});

describe.each(["ltr", "rtl"] as const)("the Solid scrolling week, %s", (dir) => {
  test("a swipe past halfway comes to rest on the next week and moves the range", async () => {
    await render(() => <Screen dir={dir} view="scrolling-week" />);
    const { position, scrollBy } = axis();
    const start = position();
    // Wednesday October 7's week, from Monday.
    expect(title()).toBe("Oct 5 – 11, 2026");

    await scrollBy(4.4, dir);

    await until(() => expect(title()).toBe("Oct 12 – 18, 2026"));
    expect(reported.anchors.at(-1)?.toString()).toBe("2026-10-12");
    await until(() => near(position(), start + 7));
  });

  test("a drag let go short of halfway comes back to the week", async () => {
    await render(() => <Screen dir={dir} view="scrolling-week" />);
    const { dragBy, position } = axis();
    const start = position();

    await dragBy(2.4, dir);

    await until(() => near(position(), start));
    expect(title()).toBe("Oct 5 – 11, 2026");
    expect(reported.anchors).toEqual([]);
  });

  test("a long swipe keeps the days around the view rendered as it passes them", async () => {
    await render(() => <Screen dir={dir} view="scrolling-week" />);
    const { scrollBy, scroller } = axis();

    for (let step = 0; step < 5; step += 1) await scrollBy(7, dir);

    await until(() => expect(title()).toBe("Nov 9 – 15, 2026"));
    const columns = [...scroller.querySelectorAll('[role="gridcell"][data-date]')];
    expect(columns.map((column) => column.getAttribute("data-date"))).toContain("2026-11-22");
    expect(columns.map((column) => column.getAttribute("data-date"))).not.toContain("2026-10-05");
    // Only the visible days reach assistive technology.
    expect(columns.filter((column) => !column.hasAttribute("aria-hidden"))).toHaveLength(7);
    expect(reported.ranges.at(-1)?.loadRange.start.toString()).toBe("2026-11-02");
  });

  test("the days run in the reading order", async () => {
    await render(() => <Screen dir={dir} view="scrolling-week" />);
    const { scroller } = axis();
    const cell = (date: string) =>
      scroller.querySelector(`[role="gridcell"][data-date="${date}"]`)!.getBoundingClientRect();
    const [monday, tuesday] = [cell("2026-10-05"), cell("2026-10-06")];
    expect(
      Math.round(dir === "ltr" ? tuesday.left - monday.right : monday.left - tuesday.right),
    ).toBe(0);
    // The week fills the days' element, from its inline start.
    const box = scroller.getBoundingClientRect();
    expect(
      Math.abs(dir === "ltr" ? monday.left - box.left : box.right - monday.right),
    ).toBeLessThan(1);
  });
});

describe("the Solid scrolling 3-day and day", () => {
  test("a 3-day view swipes three days at a time", async () => {
    await render(() => <Screen view="scrolling-3-day" />);
    const { dragBy, position } = axis();
    const start = position();
    expect(title()).toBe("Oct 7 – 9, 2026");

    await dragBy(1.7);
    await until(() => expect(title()).toBe("Oct 10 – 12, 2026"));
    await until(() => near(position(), start + 3));

    // Short of halfway, it comes back.
    await dragBy(1.2);
    await until(() => near(position(), start + 3));
    expect(reported.anchors.map(String)).toEqual(["2026-10-10"]);
  });

  test("a 3-day view held at its anchor stays put for a date that starts another range", async () => {
    // The app keeps October 7 through any change.
    await render(() => (
      <Screen heldAnchor={Temporal.PlainDate.from("2026-10-07")} view="scrolling-3-day" />
    ));
    const { dragBy, position, scroller } = axis();
    const start = position();
    await dragBy(1.7);
    await until(() => expect(reported.anchors.map(String)).toEqual(["2026-10-10"]));
    near(position(), start + 3);

    // October 8 lies in the range the app kept, but starts another one, which it declines too.
    screen.actions!.setAnchorDate(Temporal.PlainDate.from("2026-10-08"));
    await settled();
    await atRest(scroller);

    near(position(), start + 3);
    expect(reported.anchors.map(String)).toEqual(["2026-10-10", "2026-10-08"]);
  });

  test("a day view's scroll settles on a whole day", async () => {
    await render(() => <Screen view="scrolling-day" />);
    const { position, scrollBy } = axis();
    const start = position();

    await scrollBy(0.7);

    await until(() => expect(title()).toBe("October 8, 2026"));
    await until(() => near(position(), start + 1, 0.02));
  });

  // WebKit doesn't stop a programmatic scroll at the next snap point: #181.
  test.skipIf(inWebKit)(
    "a day view scrolled down to the evening still stops a swipe at the next day",
    async () => {
      await render(() => <Screen view="scrolling-day" />);
      const { hours, position, scroller } = axis();
      const start = position();
      const day = scroller.getBoundingClientRect().width;
      hours.scrollTop = hours.scrollHeight;
      await settled();

      // A swipe worth more than two days, which snapping stops at the next one.
      scroller.scrollBy({ behavior: "instant", left: day * 2.6 });
      await settled();

      await until(() => expect(title()).toBe("October 8, 2026"));
      await until(() => near(position(), start + 1, 0.02));
    },
  );

  // React's view keeps its canvas across the switch, and its file compares the scroll positions;
  // the Solid view mounts afresh, so this checks what the user sees: the day at the start.
  test("switching between the scrolling week and day keeps the day in view", async () => {
    await render(() => <Screen view="scrolling-week" />);
    await atRest(axis().scroller);

    // The week starts on Monday the 5th; the day view shows the anchor, Wednesday the 7th.
    screen.actions!.setView("scrolling-day");
    await settled();
    await atRest(axis().scroller);
    expect(title()).toBe("October 7, 2026");
    expect(leading()).toEqual({ date: "2026-10-07", offset: 0 });

    screen.actions!.setView("scrolling-week");
    await settled();
    await atRest(axis().scroller);
    expect(title()).toBe("Oct 5 – 11, 2026");
    expect(leading()).toEqual({ date: "2026-10-05", offset: 0 });
    expect(reported.anchors).toEqual([]);
  });

  test("a week's date opens the day view on that day", async () => {
    await render(() => <Screen view="scrolling-week" />);
    document.querySelector<HTMLElement>('[aria-label="Open Friday, October 9, 2026"]')!.click();
    await settled();
    await atRest(axis().scroller);

    expect(title()).toBe("October 9, 2026");
    expect(leading()).toEqual({ date: "2026-10-09", offset: 0 });
  });
});

describe("the Solid scrolling week follows the toolbar and the app", () => {
  test("Next and Today scroll to their range", async () => {
    await render(() => <Screen view="scrolling-week" />);
    const { position } = axis();
    const start = position();

    await toolbar("Next period");
    expect(title()).toBe("Oct 12 – 18, 2026");
    await until(() => near(position(), start + 7));

    // Today, October 8, is in the first week.
    await toolbar("Today");
    expect(title()).toBe("Oct 5 – 11, 2026");
    await until(() => near(position(), start));
  });

  test("Next undone before its scroll moves leaves the view where it was", async () => {
    await render(() => <Screen view="scrolling-week" />);
    const { position, scroller } = axis();
    const start = position();

    document.querySelector<HTMLElement>('[aria-label="Next period"]')!.click();
    screen.actions!.setAnchorDate(Temporal.PlainDate.from("2026-10-07"));
    await settled();
    await atRest(scroller);

    expect(title()).toBe("Oct 5 – 11, 2026");
    near(position(), start);
    expect(reported.anchors.map(String)).toEqual(["2026-10-14", "2026-10-07"]);
  });

  test("Today brings back the anchor an app kept while the view was scrolled ahead", async () => {
    // Today is October 8, and the app keeps it as the anchor through any scroll.
    await render(() => (
      <Screen heldAnchor={Temporal.PlainDate.from("2026-10-08")} view="scrolling-week" />
    ));
    const { position, scrollBy } = axis();
    const start = position();

    await scrollBy(7);
    await until(() => expect(reported.anchors.map(String)).toEqual(["2026-10-12"]));
    expect(title()).toBe("Oct 5 – 11, 2026");
    await until(() => near(position(), start + 7));

    // Today asks for October 8, inside the week the app kept, so the range doesn't change.
    await toolbar("Today");

    await until(() => near(position(), start));
    // The app hears Today too, so it can drop the date it was offered.
    expect(reported.anchors.map(String)).toEqual(["2026-10-12", "2026-10-08"]);
  });

  test("a jump to a far week lands on it", async () => {
    await render(() => <Screen view="scrolling-week" />);
    const { scroller } = axis();
    await atRest(scroller);

    screen.actions!.setAnchorDate(Temporal.PlainDate.from("2031-03-05"));
    await settled();
    await atRest(scroller);

    expect(title()).toBe("Mar 3 – 9, 2031");
    const monday = scroller
      .querySelector('[role="gridcell"][data-date="2031-03-03"]')!
      .getBoundingClientRect();
    expect(Math.abs(monday.left - scroller.getBoundingClientRect().left)).toBeLessThan(1);
  });

  test("flipping the direction keeps the week in view", async () => {
    const [dir, setDir] = createSignal<"ltr" | "rtl">("ltr");
    await render(() => <Screen dir={dir()} view="scrolling-week" />);
    const start = axis().position();

    for (let turn = 0; turn < 2; turn += 1) {
      setDir((current) => (current === "ltr" ? "rtl" : "ltr"));
      await settled();
      // Let a reset scroll position report itself and settle.
      await atRest(axis().scroller);

      expect(title()).toBe("Oct 5 – 11, 2026");
      near(axis().position(), start);
    }
    expect(reported.anchors).toEqual([]);
  });

  test("days that widen without the view resizing still swipe", async () => {
    await render(() => <Screen view="scrolling-week" />);
    // A narrower gutter widens the days; the scrolling element keeps its size.
    grid().style.setProperty("--calendar-gutter-width", "80px");
    await settled();
    await atRest(axis().scroller);
    const { position, scrollBy } = axis();
    const start = position();

    await scrollBy(7);

    await until(() => expect(title()).toBe("Oct 12 – 18, 2026"));
    near(position(), start + 7);
  });

  test("a scroller a pixel narrower keeps the leading day at the start", async () => {
    await render(() => <Screen view="scrolling-week" />);
    const { hours, scrollBy, scroller } = axis();
    await scrollBy(7);
    await until(() => expect(title()).toBe("Oct 12 – 18, 2026"));
    const leading = () =>
      scroller.querySelector('[role="gridcell"][data-date="2026-10-12"]')!.getBoundingClientRect()
        .left;
    const before = leading();

    // Each day narrows by a seventh of a pixel, a thousand days from the canvas start.
    hours.style.width = `${hours.getBoundingClientRect().width - 1}px`;
    await settled();
    await atRest(scroller);

    expect(Math.abs(leading() - before)).toBeLessThan(1);
    expect(title()).toBe("Oct 12 – 18, 2026");
  });
});

describe("the Solid scrolling week's keyboard across its visible days", () => {
  const focused = () => document.activeElement?.getAttribute("aria-label") ?? "";

  test("keys move through the visible days and scroll a page past them", async () => {
    await render(() => <Screen view="scrolling-week" />);
    const { position, scroller } = axis();
    const start = position();
    grid().querySelector<HTMLElement>('[tabindex="0"]')!.focus();
    await settled();

    await press("End");
    expect(focused()).toMatch(/^Sunday, October 11/);
    await press("ArrowRight");

    expect(title()).toBe("Oct 12 – 18, 2026");
    expect(focused()).toMatch(/^Monday, October 12/);
    // From the keyboard, the view jumps rather than animating past the focus.
    near(position(), start + 7);
    await atRest(scroller);

    // Back across the edge the other way, and the only tab stop is in the visible days.
    await press("ArrowLeft");
    expect(title()).toBe("Oct 5 – 11, 2026");
    expect(focused()).toMatch(/^Sunday, October 11/);
    const stops = grid().querySelectorAll('[tabindex="0"]');
    expect(stops).toHaveLength(1);
    expect(stops[0]!.closest('[aria-hidden="true"]')).toBeNull();
  });

  test("a slot's keys page the hours' columns past the visible days", async () => {
    await render(() => <Screen view="scrolling-3-day" />);
    const { position, scroller } = axis();
    await atRest(scroller);
    const start = position();
    // Friday the 9th's first slot, the last day shown.
    const header = document.querySelector('[data-slot="scrolling-time-grid-header"]')!;
    header
      .querySelector('[data-date="2026-10-09"]')!
      .closest<HTMLElement>('[role="gridcell"]')!
      .focus();
    await settled();
    await press("ArrowDown");
    expect(document.activeElement?.closest("[data-date]")?.getAttribute("data-date")).toBe(
      "2026-10-09",
    );

    await press("ArrowRight");

    expect(title()).toBe("Oct 10 – 12, 2026");
    expect(document.activeElement?.closest("[data-date]")?.getAttribute("data-date")).toBe(
      "2026-10-10",
    );
    near(position(), start + 3);
  });

  test("a keyboard move past the visible days takes the event and the view on", async () => {
    await render(() => <Screen view="scrolling-3-day" />);
    const { scroller } = axis();
    await atRest(scroller);
    scroller.querySelector<HTMLElement>('[data-event-id="planning"]')!.focus();
    await settled();

    await press(" ");
    expect(spoken()).toMatch(/^Picked up Planning, Thursday, October 8/);
    // Thursday the 8th to Saturday the 10th, past the 9th, the last day shown.
    await press("ArrowRight");
    await press("ArrowRight");
    expect(title()).toBe("Oct 10 – 12, 2026");
    expect(spoken()).toMatch(/^Saturday, October 10/);
    await press("Enter");

    await until(() => expect(reported.changes).toHaveLength(1));
    const [change] = reported.changes;
    expect(change?.cause).toBe("move");
    expect(String(change?.proposed?.start)).toBe("2026-10-10T09:00:00Z");
    expect(spoken()).toMatch(/^Moved Planning to Saturday, October 10/);
  });
});

describe.runIf(server.browser === "chromium")(
  "the Solid scrolling week with reduced motion",
  () => {
    beforeAll(async () => {
      await cdp().send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-motion", value: "reduce" }],
      });
    });
    afterAll(async () => {
      await cdp().send("Emulation.setEmulatedMedia", { features: [] });
    });

    test("Next jumps to its range instead of scrolling there", async () => {
      expect(matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(true);
      await render(() => <Screen view="scrolling-week" />);
      const { position } = axis();
      const start = position();

      await toolbar("Next period");

      expect(title()).toBe("Oct 12 – 18, 2026");
      near(position(), start + 7);
    });
  },
);
