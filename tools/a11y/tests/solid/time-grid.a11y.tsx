import { createCalendar, createCanonicalEventAdapter } from "@moltenship/calendar-solid";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { cdp, page, server, userEvent } from "vite-plus/test/browser";

import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import {
  createDayView,
  createThreeDayView,
  createWeekView,
} from "@registry/time-grid-view/time-grid-view";

import { seriousViolations, setTheme, themes } from "../axe";
import { describeLayout } from "../kit-twins";
import {
  timeGridAnchor,
  timeGridEvents,
  timeGridNow,
  timeGridWeekRules,
  timeGridZones,
  type TimeGridFixture,
} from "../time-grid-fixture";
import day from "../view-twins/day.txt?raw";
import week from "../view-twins/week.txt?raw";
import { render, settled, until } from "./render";

// The Solid registry's week and day views in a real browser, against what React's files check
// (time-grid-twins, registry-views, rtl-layout, phone-layout and reduced-motion): they render
// React's grids, pass axe in both themes, mirror in RTL, and their targets are 24 px on a phone.

type View = "3-day" | "day" | "week";

const Calendar = createCalendar<TimeGridFixture>()({
  eventAdapter: createCanonicalEventAdapter<{ readonly color: CalendarEventColor }, string>(),
  views: [
    createWeekView<TimeGridFixture>({
      dayView: "day",
      getEventColor: (event) => event.data.color,
    }),
    createDayView<TimeGridFixture>({ getEventColor: (event) => event.data.color }),
    createThreeDayView<TimeGridFixture>({ getEventColor: (event) => event.data.color }),
  ],
});

function TimeGrid(props: { readonly dir?: "ltr" | "rtl"; readonly view?: View }) {
  const view = () => props.view ?? "week";
  return (
    <Calendar.Root
      defaultAnchorDate={timeGridAnchor}
      defaultTimeZone="UTC"
      defaultView={view()}
      direction={props.dir ?? "ltr"}
      events={timeGridEvents}
      locale="en-US"
      now={timeGridNow}
      onEventChange={() => {}}
      secondaryTimeZones={view() === "day" ? timeGridZones : undefined}
      weekRules={timeGridWeekRules}
    >
      <Calendar.Frame class="flex h-dvh flex-col" dir={props.dir ?? "ltr"}>
        <Calendar.Viewport class="min-h-0 flex-1">
          <Calendar.ActiveView />
        </Calendar.Viewport>
      </Calendar.Frame>
    </Calendar.Root>
  );
}

const grid = () => document.querySelector<HTMLElement>('[data-slot="time-grid"]')!;
const column = (date: string) =>
  grid().querySelector<HTMLElement>(`[data-slot="time-grid-body"] [data-date="${date}"]`)!;
const chip = (id: string) => grid().querySelector<HTMLElement>(`[data-event-id="${id}"]`)!;
const longTitle = "Quarterly roadmap review with the platform, design and research teams";
const nowLine = () =>
  until(() => expect(grid().querySelector('[data-slot="time-grid-now"]')).not.toBeNull());

// The descriptions are Chromium's: another engine serializes some attributes its own way.
describe.runIf(server.browser === "chromium")("the Solid time grid renders React's", () => {
  test("the week, with its all-day row collapsed", async () => {
    await render(() => <TimeGrid view="week" />);
    await nowLine();
    expect(describeLayout(grid())).toBe(week);
  });

  test("the day, with a second time zone", async () => {
    await render(() => <TimeGrid view="day" />);
    await nowLine();
    expect(describeLayout(grid())).toBe(day);
  });
});

describe.each(themes)("the Solid time grid, %s theme", (theme) => {
  test.each(["week", "day"] as const)("the %s has no serious violations", async (view) => {
    setTheme(theme);
    await render(() => <TimeGrid view={view} />);
    await nowLine();

    expect(await seriousViolations()).toEqual([]);
  });

  test("the all-day row has none expanded, and an event none while hovered", async () => {
    setTheme(theme);
    await render(() => <TimeGrid />);
    grid().querySelector<HTMLElement>('[aria-label="Show all all-day events"]')!.click();
    await settled();
    expect(grid().querySelector('[aria-label="Show fewer all-day events"]')).not.toBeNull();
    await userEvent.hover(chip("Planning"));

    expect(await seriousViolations()).toEqual([]);
  });
});

describe("the Solid time grid's tooltip", () => {
  test("shows a clipped title in full, and nothing for a title that fits", async () => {
    await render(() => <TimeGrid />);
    // Tuesday's review has the column to itself, so its title fits on one line.
    await userEvent.hover(chip("Locked review"));
    await settled();
    expect(document.querySelector('[data-slot="tooltip-content"][data-open]')).toBeNull();

    await userEvent.hover(chip(longTitle));
    await until(() =>
      expect(document.querySelector('[data-slot="tooltip-content"][data-open]')?.textContent).toBe(
        longTitle,
      ),
    );
    // It names the event as its chip does, and renders outside the grid.
    const content = document.querySelector('[data-slot="tooltip-content"]')!;
    expect(content.getAttribute("aria-label")).toBe(chip(longTitle).getAttribute("aria-label"));
    expect(grid().contains(content)).toBe(false);
  });
});

describe.each(["ltr", "rtl"] as const)("the Solid time grid, %s", (dir) => {
  const px = (value: number) => Math.round(value) + 0;
  /** Inline distance from the end of `first` to the start of `second`, in reading order. */
  const gap = (first: DOMRect, second: DOMRect) =>
    px(dir === "ltr" ? second.left - first.right : first.left - second.right);
  /** How far `inner` sits from the inline-start and inline-end edges of `outer`. */
  const insets = ({ left, right }: DOMRect, outer: DOMRect) =>
    dir === "ltr"
      ? { end: px(outer.right - right), start: px(left - outer.left) }
      : { end: px(left - outer.left), start: px(outer.right - right) };

  test("hour gutter, day columns and event blocks follow the reading order", async () => {
    await render(() => <TimeGrid dir={dir} />);
    const box = (date: string) => column(date).getBoundingClientRect();
    const hourLabel = [...grid().querySelectorAll('[data-slot="time-grid-body"] span')].find(
      (label) => label.textContent === "9 AM",
    )!;

    expect(gap(hourLabel.getBoundingClientRect(), box("2026-10-05"))).toBe(8);
    expect(gap(box("2026-10-05"), box("2026-10-06"))).toBe(0);
    // Past the column's 1px divider, with a strip left free at the inline end for creating.
    expect(insets(chip("Design review").getBoundingClientRect(), box("2026-10-08")).start).toBe(1);
    // Overlapping events sit side by side from the inline start.
    expect(
      gap(chip("Design review").getBoundingClientRect(), chip("Planning").getBoundingClientRect()),
    ).toBe(0);
    const event = getComputedStyle(chip("Design review"));
    expect(dir === "rtl" ? event.borderRightWidth : event.borderLeftWidth).toBe("3px");
  });

  test("a multi-day all-day bar spans its days from the inline start", async () => {
    await render(() => <TimeGrid dir={dir} />);
    const cell = (date: string) =>
      grid()
        .querySelector(`[data-all-day][data-date="${date}"]`)!
        .closest('[role="gridcell"]')!
        .getBoundingClientRect();
    const bar = chip("Conference").getBoundingClientRect();

    // Past the cell's 1px divider and the bar's margin, and three days wide, less its margins.
    expect(insets(bar, cell("2026-10-05")).start).toBe(5);
    expect(insets(bar, cell("2026-10-07")).end).toBe(4);
  });
});

/** The pointer targets in view smaller than 24 × 24 px, and not spaced as WCAG 2.5.8 allows. */
function undersizedTargets(): string[] {
  const targets = [
    ...document.querySelectorAll<HTMLElement>("a[href], button, [role='button'], [data-event-id]"),
  ]
    .filter((element) => getComputedStyle(element).pointerEvents !== "none")
    .map((element) => ({ box: element.getBoundingClientRect(), element }))
    .filter(
      ({ box }) =>
        box.width > 0 &&
        box.bottom > 0 &&
        box.top < innerHeight &&
        box.right > 0 &&
        box.left < innerWidth,
    );
  // A timed event's box is its time span, which excuses its height but not its width.
  const spansTime = (element: HTMLElement) =>
    element.hasAttribute("data-event-id") &&
    element.closest("[data-date]:not([data-all-day])") !== null;
  const small = targets.filter(
    ({ box, element }) => box.width < 24 || (box.height < 24 && !spansTime(element)),
  );
  const centre = ({ box }: (typeof targets)[number]) =>
    [box.left + box.width / 2, box.top + box.height / 2] as const;
  const nested = (a: HTMLElement, b: HTMLElement) => a === b || a.contains(b) || b.contains(a);
  return small
    .filter((target) => {
      const [x, y] = centre(target);
      const reachesTarget = targets.some(
        ({ box, element }) =>
          !nested(element, target.element) &&
          Math.hypot(
            Math.max(box.left - x, 0, x - box.right),
            Math.max(box.top - y, 0, y - box.bottom),
          ) < 12,
      );
      const reachesCircle = small.some((other) => {
        if (nested(other.element, target.element)) return false;
        const [ox, oy] = centre(other);
        return Math.hypot(x - ox, y - oy) < 24;
      });
      return reachesTarget || reachesCircle;
    })
    .map(({ box, element }) => {
      const name = element.getAttribute("aria-label") ?? element.textContent ?? "";
      return `${name.trim().slice(0, 30)} ${Math.round(box.width)}×${Math.round(box.height)}`;
    });
}

// A phone's coarse pointer needs Chromium's touch emulation through CDP. The week isn't here:
// seven columns at 375 px are too narrow for its events, so phones get the 3-day view.
describe.runIf(server.browser === "chromium")(
  "the Solid time grid on a 375 px touch screen",
  () => {
    beforeAll(async () => {
      await page.viewport(375, 667);
      await cdp().send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    });
    afterAll(async () => {
      await cdp().send("Emulation.setTouchEmulationEnabled", { enabled: false });
      await page.viewport(1280, 800);
    });

    test.each(["day", "3-day"] as const)(
      "the %s view's targets are 24 px, or spaced as WCAG 2.5.8 allows",
      async (view) => {
        await render(() => <TimeGrid view={view} />);
        await nowLine();

        expect(undersizedTargets()).toEqual([]);
      },
    );

    test("a long-press on the grid selects no text", async () => {
      await render(() => <TimeGrid view="3-day" />);

      expect(getComputedStyle(grid()).userSelect).toBe("none");
    });
  },
);

describe.runIf(server.browser === "chromium")("the Solid time grid with reduced motion", () => {
  beforeAll(async () => {
    await cdp().send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
  });
  afterAll(async () => {
    await cdp().send("Emulation.setEmulatedMedia", { features: [] });
  });

  test("a clipped title's tooltip fades in without zooming or sliding", async () => {
    expect(matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(true);
    await render(() => <TimeGrid />);
    await userEvent.hover(chip(longTitle));
    await until(() =>
      expect(document.querySelector('[data-slot="tooltip-content"]')).not.toBeNull(),
    );
    const { scale, translate } = getComputedStyle(
      document.querySelector<HTMLElement>('[data-slot="tooltip-content"]')!,
    );

    // Only opacity moves on the way in.
    expect([scale, translate]).toEqual(["none", "none"]);
  });
});
