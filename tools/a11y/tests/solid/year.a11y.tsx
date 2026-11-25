import { createCalendar, createCanonicalEventAdapter } from "@moltenship/calendar-solid";
import { createSignal } from "solid-js";
import { afterAll, beforeAll, describe, expect, test, vi } from "vite-plus/test";
import { cdp, page, server, userEvent } from "vite-plus/test/browser";

import { CalendarToolbar } from "@registry/calendar/calendar-toolbar";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import { createYearView } from "@registry/year-view/year-view";

import { seriousViolations, setTheme, themes } from "../axe";
import { opened } from "../kit-twins";
import year from "../view-twins/year.txt?raw";
import yearPopover from "../view-twins/year-popover.txt?raw";
import {
  describeYear,
  yearAnchor,
  yearAvailability,
  yearEvents,
  yearNow,
  yearWeekRules,
  type YearFixture,
} from "../year-fixture";
import { nextFrame } from "../waits";
import { atRest, press, render, settled, until } from "./render";

// The Solid registry's year in a real browser, against what React's year files check
// (year-twins, year-view, registry-views, rtl-layout, phone-layout and reduced-motion): it renders
// React's year, passes axe in both themes, mirrors in RTL, hands focus back from its popover,
// scrolls only itself to the month in view, and its days are 24 px targets on a phone.

const Calendar = createCalendar<YearFixture>()({
  eventAdapter: createCanonicalEventAdapter<{ readonly color: CalendarEventColor }, string>(),
  views: [createYearView<YearFixture>({ getEventColor: (event) => event.data.color })],
});

function Year(props: { readonly dir?: "ltr" | "rtl"; readonly onEventChange?: () => void }) {
  return (
    <Calendar.Root
      availability={yearAvailability}
      defaultAnchorDate={yearAnchor}
      defaultTimeZone="UTC"
      defaultView="year"
      direction={props.dir ?? "ltr"}
      events={yearEvents}
      locale="en-US"
      now={yearNow}
      onEventChange={props.onEventChange}
      weekRules={yearWeekRules}
    >
      <Calendar.Frame class="flex h-dvh flex-col" dir={props.dir ?? "ltr"}>
        <Calendar.Viewport class="min-h-0 flex-1">
          <Calendar.ActiveView />
        </Calendar.Viewport>
      </Calendar.Frame>
    </Calendar.Root>
  );
}

/** A phone-sized year below the fold of a taller page, so a scroll of the page would show. */
function PhoneYear(props: { readonly events?: readonly YearFixture[] }) {
  return (
    <div>
      <div class="h-[120vh]" />
      <Calendar.Root
        defaultAnchorDate={yearAnchor}
        defaultTimeZone="UTC"
        defaultView="year"
        events={props.events ?? yearEvents}
        locale="en-US"
        now={yearNow}
        weekRules={yearWeekRules}
      >
        <Calendar.Frame class="flex h-[640px] w-[390px] flex-col">
          <CalendarToolbar calendar={Calendar} />
          <Calendar.Viewport class="min-h-0 flex-1">
            <Calendar.ActiveView />
          </Calendar.Viewport>
        </Calendar.Frame>
      </Calendar.Root>
    </div>
  );
}

const view = () => document.querySelector<HTMLElement>('[data-slot="year-view"]')!;
const popover = () => document.querySelector<HTMLElement>('[data-slot="popover-content"]');
const cell = (date: string) =>
  view().querySelector<HTMLElement>(`[role="gridcell"][data-date="${date}"]`)!;

/** Clicks the day's button and waits for its popover to open. */
async function openDay(date: string) {
  cell(date).querySelector("button")!.click();
  await settled();
  await until(() => expect(opened(popover())).toBe(true));
  return popover()!;
}

/** Whether `month` ("2026-10") shows whole inside the view's scrollport. */
function showsMonth(month: string): boolean {
  const bounds = view().getBoundingClientRect();
  const box = document.querySelector(`[data-month="${month}"]`)!.getBoundingClientRect();
  return box.top >= bounds.top && box.bottom <= bounds.bottom;
}

// The descriptions are Chromium's: another engine serializes some attributes its own way.
describe.runIf(server.browser === "chromium")("the Solid year renders React's", () => {
  test("the year, and a day's popover open", async () => {
    await render(() => <Year />);
    expect(describeYear(view())).toBe(year);

    await openDay("2026-10-08");
    expect(describeYear(view(), popover()!)).toBe(yearPopover);
  });
});

describe.each(themes)("the Solid year, %s theme", (theme) => {
  test("has no serious violations, with its day popover closed and open", async () => {
    setTheme(theme);
    await render(() => <Year />);
    expect(await seriousViolations()).toEqual([]);

    await openDay("2026-10-08");
    expect(await seriousViolations()).toEqual([]);
  });

  test("an event in the day popover keeps its contrast while hovered", async () => {
    setTheme(theme);
    await render(() => <Year />);
    const popup = await openDay("2026-10-08");
    await userEvent.hover(popup.querySelector<HTMLElement>('[data-event-id$=" meeting"]')!);

    expect(await seriousViolations()).toEqual([]);
  });
});

describe.each(["ltr", "rtl"] as const)("the Solid year, %s", (dir) => {
  const px = (value: number) => Math.round(value) + 0;

  test("days and months follow the reading order", async () => {
    await render(() => <Year dir={dir} />);
    const box = (element: Element) => element.getBoundingClientRect();
    const gap = (first: DOMRect, second: DOMRect) =>
      px(dir === "ltr" ? second.left - first.right : first.left - second.right);

    // Monday, October 12, then Tuesday; January, then February.
    expect(gap(box(cell("2026-10-12")), box(cell("2026-10-13")))).toBe(0);
    const january = box(document.querySelector('[data-month="2026-01"]')!);
    const february = box(document.querySelector('[data-month="2026-02"]')!);
    expect(gap(january, february)).toBeGreaterThan(0);
  });
});

describe("the Solid year's keyboard and focus", () => {
  test("arrow and Page keys move between days and months", async () => {
    await render(() => <Year />);
    cell("2026-10-08").focus();

    await press("ArrowRight");
    expect(document.activeElement).toBe(cell("2026-10-09"));
    await press("ArrowDown");
    expect(document.activeElement).toBe(cell("2026-10-16"));
    await press("PageDown");
    expect(document.activeElement).toBe(cell("2026-11-16"));
  });

  test("a clicked day's popover hands focus back to the day, where Space opens it again", async () => {
    const onEventChange = vi.fn();
    await render(() => <Year onEventChange={onEventChange} />);

    const popup = await openDay("2026-10-14");
    await until(() => expect(popup.contains(document.activeElement)).toBe(true));
    await userEvent.keyboard("{Escape}");
    await until(() => expect(popup.isConnected).toBe(false));
    expect(document.activeElement).toBe(cell("2026-10-14"));

    await userEvent.keyboard(" ");
    await until(() => expect(popover()?.contains(document.activeElement)).toBe(true));
    expect(onEventChange).not.toHaveBeenCalled();
  });

  test("a popover opened from the keyboard hands focus back to the day, where Enter opens it again", async () => {
    const onEventChange = vi.fn();
    await render(() => <Year onEventChange={onEventChange} />);
    cell("2026-10-14").focus();

    await userEvent.keyboard("{Enter}");
    await until(() => expect(popover()?.contains(document.activeElement)).toBe(true));
    const popup = popover()!;
    // Tab reaches the day's date, then its events.
    expect(popup.querySelector("button")?.getAttribute("aria-label")).toBe(
      "Wednesday, October 14, 2026",
    );
    await userEvent.keyboard("{Escape}");
    await until(() => expect(popup.isConnected).toBe(false));
    expect(document.activeElement).toBe(cell("2026-10-14"));

    await userEvent.keyboard("{Enter}");
    await until(() => expect(popover()?.contains(document.activeElement)).toBe(true));
    expect(onEventChange).not.toHaveBeenCalled();
  });
});

describe("the Solid year, phone-sized", () => {
  test("opens on today's month, scrolling only itself", async () => {
    await render(() => <PhoneYear />);

    // Two months to a row: January's row would show first without the scroll.
    await until(() => expect(showsMonth("2026-10")).toBe(true));
    expect(showsMonth("2026-01")).toBe(false);
    expect(window.scrollY).toBe(0);
  });

  test("Today, Previous and Next bring the anchor's month back into view", async () => {
    await render(() => <PhoneYear />);
    view().scrollTop = 0;

    document.querySelector<HTMLElement>('button[aria-label="Today"]')!.click();
    await settled();
    await atRest(view());
    expect(showsMonth("2026-10")).toBe(true);

    document.querySelector<HTMLElement>('button[aria-label="Next period"]')!.click();
    await settled();
    expect(document.querySelector('[data-month="2027-10"]')).not.toBeNull();
    await atRest(view());
    expect(showsMonth("2027-10")).toBe(true);

    view().scrollTop = 0;
    document.querySelector<HTMLElement>('button[aria-label="Previous period"]')!.click();
    await settled();
    expect(document.querySelector('[data-month="2026-10"]')).not.toBeNull();
    await atRest(view());
    expect(showsMonth("2026-10")).toBe(true);
    expect(window.scrollY).toBe(0);
  });

  test("new events for the same year leave the months where the user scrolled them", async () => {
    const [events, setEvents] = createSignal<readonly YearFixture[]>(yearEvents);
    await render(() => <PhoneYear events={events()} />);
    await until(() => expect(showsMonth("2026-10")).toBe(true));
    view().scrollTop = 0;

    // As `onVisibleRangeChange` loading the year would, with focus outside the view.
    setEvents((all) => all.slice(1));
    await settled();
    await nextFrame();
    await nextFrame();

    expect(view().scrollTop).toBe(0);
    expect(showsMonth("2026-01")).toBe(true);
  });

  test("keyboard focus brings its own day into view as it crosses the year", async () => {
    await render(() => <PhoneYear />);
    cell("2026-12-31").focus();

    await press("ArrowRight");

    await until(() => expect(document.activeElement?.getAttribute("data-date")).toBe("2027-01-01"));
    await atRest(view());
    const bounds = view().getBoundingClientRect();
    const day = document.activeElement!.getBoundingClientRect();
    expect(day.top >= bounds.top && day.bottom <= bounds.bottom).toBe(true);
  });
});

// A phone's coarse pointer needs Chromium's touch emulation through CDP.
describe.runIf(server.browser === "chromium")("the Solid year on a 375 px touch screen", () => {
  beforeAll(async () => {
    await page.viewport(375, 667);
    await cdp().send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  });
  afterAll(async () => {
    await cdp().send("Emulation.setTouchEmulationEnabled", { enabled: false });
    await page.viewport(1280, 800);
  });

  test("every day and month name is a 24 px target, and the page doesn't scroll", async () => {
    await render(() => <Year />);
    await until(() => expect(showsMonth("2026-10")).toBe(true));

    const small = [
      ...view().querySelectorAll<HTMLElement>(
        "[data-slot='popover-trigger'], [data-month] > button",
      ),
    ]
      .map((target) => ({ box: target.getBoundingClientRect(), target }))
      .filter(({ box }) => box.width < 24 || box.height < 24)
      .map(({ box, target }) => `${target.getAttribute("aria-label")} ${box.width}×${box.height}`);
    expect(small).toEqual([]);
    expect(window.scrollY).toBe(0);
  });
});

describe.runIf(server.browser === "chromium")("the Solid year with reduced motion", () => {
  beforeAll(async () => {
    await cdp().send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
  });
  afterAll(async () => {
    await cdp().send("Emulation.setEmulatedMedia", { features: [] });
  });

  test("its day popover fades in without zooming or sliding", async () => {
    expect(matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(true);
    await render(() => <Year />);
    cell("2026-10-08").querySelector("button")!.click();
    await settled();
    const content = popover()!;
    const { scale, translate } = getComputedStyle(content);

    // Only opacity moves on the way in.
    expect([scale, translate]).toEqual(["none", "none"]);
    await until(() => expect(opened(content)).toBe(true));
  });
});
