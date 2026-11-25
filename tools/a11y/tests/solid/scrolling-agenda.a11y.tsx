import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEvent,
} from "@moltenship/calendar-solid";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vite-plus/test";
import { cdp, page, server, userEvent } from "vite-plus/test/browser";

import { CalendarToolbar } from "@registry/calendar/calendar-toolbar";
import {
  calendarEventColors,
  type CalendarEventColor,
} from "@registry/shared/calendar-theme/event-colors";
import { createScrollingAgendaView } from "@registry/scrolling-list-view/scrolling-agenda-view";

import { seriousViolations, setTheme, themes } from "../axe";
import { describeTree } from "../kit-twins";
import {
  monthAnchor,
  monthAvailability,
  monthEvents,
  monthNow,
  monthWeekRules,
} from "../month-fixture";
import scrollingAgenda from "../view-twins/scrolling-agenda.txt?raw";
import { atRest, inWebKit, press, render, settled, until } from "./render";

// The Solid registry's scrolling agenda in a real browser, against what React's files check
// (scrolling-twins, long-agenda, rtl-layout, phone-layout and reduced-motion): it renders React's
// scrolling agenda, passes axe in both themes, follows a long scroll through 10,000 events with
// the anchor date, keys cross the range's ends with focus in view, it mirrors in RTL, a finger's
// swipe past an end moves the calendar on, and its spinner keeps still for reduced motion.

type Fixture = CalendarEvent<{ readonly color: CalendarEventColor }, string>;

const Calendar = createCalendar<Fixture>()({
  eventAdapter: createCanonicalEventAdapter<{ readonly color: CalendarEventColor }, string>(),
  views: [createScrollingAgendaView<Fixture>({ getEventColor: (event) => event.data.color })],
});

const anchor = Temporal.PlainDate.from("2026-10-08");
const titles = ["Standup", "Design review", "Lunch", "Focus time", "Gym", "1:1", "Planning"];

/** 10,000 events over two years from a year back, as React's long-agenda file has. */
const events: readonly Fixture[] = Array.from({ length: 10_000 }, (_, index): Fixture => {
  const date = anchor.subtract({ weeks: 52 }).add({ days: index % 728 });
  const color = calendarEventColors[index % calendarEventColors.length]!;
  const id = `event-${index}`;
  if (index % 728 === index && index % 23 === 0) {
    const end = date.add({ days: 3 });
    return { data: { color }, end, id, kind: "all-day", start: date, title: "Offsite" };
  }
  const start = date
    .toZonedDateTime({ plainTime: { hour: 6 + Math.floor(index / 728) }, timeZone: "UTC" })
    .toInstant();
  const end = start.add({ minutes: 30 * (1 + (index % 4)) });
  return { data: { color }, end, id, kind: "timed", start, title: titles[index % titles.length]! };
});

let anchors: Temporal.PlainDate[] = [];

afterEach(() => {
  anchors = [];
});

function Agenda(props: {
  readonly availability?: boolean;
  readonly dir?: "ltr" | "rtl";
  readonly events?: readonly Fixture[];
  readonly loading?: boolean;
  readonly toolbar?: boolean;
  readonly weeks?: number;
}) {
  return (
    <Calendar.Root
      availability={props.availability === true ? monthAvailability : undefined}
      defaultAnchorDate={anchor}
      defaultTimeZone="UTC"
      defaultView="scrolling-agenda"
      direction={props.dir ?? "ltr"}
      events={props.events ?? events}
      locale="en-US"
      now={monthNow}
      onAnchorDateChange={(date) => anchors.push(date)}
      onEventChange={() => {}}
      viewOptions={{
        "scrolling-agenda": { loading: props.loading === true, weeks: props.weeks ?? 52 },
      }}
      weekRules={monthWeekRules}
    >
      <Calendar.Frame class="flex h-dvh flex-col" dir={props.dir ?? "ltr"}>
        {props.toolbar === false ? null : <CalendarToolbar calendar={Calendar} class="border-b" />}
        <Calendar.Viewport class="min-h-0 flex-1">
          <Calendar.ActiveView />
        </Calendar.Viewport>
      </Calendar.Frame>
    </Calendar.Root>
  );
}

const list = () => document.querySelector<HTMLElement>('[data-slot="agenda-view"]')!;
const days = () => [...list().querySelectorAll<HTMLElement>("li[data-date]")];
const title = () => document.querySelector('[data-calendar-part="title"]')?.textContent;
const dayOf = () =>
  Temporal.PlainDate.from(
    document.activeElement!.closest("li")!.parentElement!.closest("li")!.dataset.date!,
  );

/** Whether `element` is inside the list's visible box. */
function inView(element: Element) {
  const box = list().getBoundingClientRect();
  const { bottom, top } = element.getBoundingClientRect();
  return top >= box.top - 1 && bottom <= box.bottom + 1;
}

/** Scrolls the list by `pixels` as a wheel does, and lets the scroll come to rest. */
async function scrollList(pixels: number) {
  const before = anchors.length;
  list().dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: pixels }));
  list().scrollBy({ behavior: "instant", top: pixels });
  await until(() => expect(anchors.length).toBeGreaterThan(before));
  await atRest(list());
}

// The descriptions are Chromium's: another engine serializes some attributes its own way.
describe.runIf(server.browser === "chromium")("the Solid scrolling agenda renders React's", () => {
  test("the days from October 8, 2026", async () => {
    await render(() => (
      <Agenda availability events={monthEvents as readonly Fixture[]} toolbar={false} weeks={4} />
    ));
    await until(() => expect(list().querySelector("[data-event-id]")).not.toBeNull());
    await atRest(list());
    expect(describeTree(list())).toBe(scrollingAgenda);
  });
});

describe.each(themes)("the Solid scrolling agenda, %s theme", (theme) => {
  test("has no serious violations with events, without, and loading more", async ({ skip }) => {
    setTheme(theme);
    await render(() => <Agenda />);
    expect(await seriousViolations()).toEqual([]);

    await render(() => <Agenda events={[]} />);
    expect(await seriousViolations()).toEqual([]);

    skip(inWebKit, "In WebKit one scroll to the end doesn't reach it, as in React's file: #181");
    await render(() => <Agenda loading />);
    list().dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    list().scrollTo({ behavior: "instant", top: list().scrollHeight });
    await until(() => expect(list().textContent).toContain("Loading events…"));
    // The spinner turns until events arrive; the check waits for animations to finish.
    for (const animation of document.getAnimations()) animation.cancel();
    expect(await seriousViolations()).toEqual([]);
  });
});

describe.each(["ltr", "rtl"] as const)(
  "a Solid scrolling agenda of 10,000 events over two years, %s",
  (dir) => {
    // On temporal-polyfill this takes WebKit too long, as in React's file: #181.
    test.skipIf(inWebKit)(
      "renders only the days in view as the list scrolls months on and back",
      async () => {
        await render(() => <Agenda dir={dir} />);
        expect(title()).toBe("Oct 8, 2026 – Oct 6, 2027");
        expect(days()[0]?.getAttribute("aria-setsize")).toBe("728");

        for (let step = 0; step < 4; step += 1) {
          await scrollList(18_000);
          expect(days().length).toBeLessThan(16);
          expect(list().querySelectorAll("[data-event-id]").length).toBeLessThan(200);
        }
        // The anchor followed the list months on, and the day on top is the anchor's.
        expect(
          Temporal.PlainDate.compare(anchors.at(-1)!, Temporal.PlainDate.from("2026-12-01")),
        ).toBe(1);
        const top = days().find(
          (day) => day.getBoundingClientRect().bottom > list().getBoundingClientRect().top + 1,
        )!;
        expect(top.dataset.date).toBe(anchors.at(-1)!.toString());

        for (let step = 0; step < 4; step += 1) await scrollList(-18_000);
        expect(days().length).toBeLessThan(16);
      },
    );

    // WebKit leaves the focused event out of view about half the time, as in React's file: #185.
    test.skipIf(inWebKit)(
      "keys move through events and days, keeping the focused event in view",
      async () => {
        await render(() => <Agenda dir={dir} />);
        const entry = list().querySelector<HTMLElement>('[tabindex="0"]')!;
        entry.focus();
        await settled();
        expect(entry.closest("li[data-date]")?.getAttribute("data-date")).toBe("2026-10-08");

        for (let step = 0; step < 40; step += 1) await press("ArrowDown");
        expect(document.activeElement?.getAttribute("data-slot")).toBe("calendar-event");
        expect(Temporal.PlainDate.compare(dayOf(), anchor)).toBe(1);
        await atRest(list());
        expect(inView(document.activeElement!)).toBe(true);

        const from = dayOf();
        for (let step = 0; step < 10; step += 1) await press("PageDown");
        expect(dayOf().toString()).toBe(from.add({ days: 10 }).toString());
        await atRest(list());
        expect(inView(document.activeElement!)).toBe(true);
        await press("PageUp");
        expect(dayOf().toString()).toBe(from.add({ days: 9 }).toString());
        await press("End");
        await atRest(list());
        expect(inView(document.activeElement!)).toBe(true);
        await press("Home");
        await atRest(list());
        expect(inView(document.activeElement!)).toBe(true);
        expect(days().length).toBeLessThan(16);
      },
    );

    // The same in WebKit: #185.
    test.skipIf(inWebKit)(
      "keys paging past the range move focus on without jumping the list",
      async () => {
        // One week from the anchor date, so a few days of keys cross into the next.
        await render(() => <Agenda dir={dir} weeks={1} />);
        list().querySelector<HTMLElement>('[tabindex="0"]')!.focus();
        await settled();

        // Real key presses: browsers run microtasks between an event's listeners, unlike a
        // dispatch from a script, and the list tells its own keys apart from other requests.
        await userEvent.keyboard("{ArrowUp}");
        await until(() => expect(dayOf().toString()).toBe("2026-10-07"));
        await atRest(list());
        expect(inView(document.activeElement!)).toBe(true);
        for (let step = 1; step <= 10; step += 1) {
          await userEvent.keyboard("{PageDown}");
          const day = Temporal.PlainDate.from("2026-10-07").add({ days: step }).toString();
          await until(() => expect(dayOf().toString()).toBe(day));
          await atRest(list());
          expect(inView(document.activeElement!)).toBe(true);
        }
        expect(title()).not.toBe("Oct 8 – 14, 2026");
      },
    );

    test("focus leaves with its day's row and comes back with it", async () => {
      // Two weeks either way, so a few scrolls take the focused day out of the list.
      await render(() => <Agenda dir={dir} weeks={2} />);
      const entry = list().querySelector<HTMLElement>('[tabindex="0"]')!;
      const id = entry.getAttribute("data-event-id");
      entry.focus();
      await settled();

      while (document.activeElement === entry) await scrollList(3000);
      expect(document.querySelector(`[data-event-id="${id}"]`)).toBeNull();
      expect(
        Temporal.PlainDate.compare(anchors.at(-1)!, Temporal.PlainDate.from("2026-10-22")),
      ).toBe(1);

      while (document.querySelector(`[data-event-id="${id}"]`) === null) await scrollList(-3000);
      await until(() => expect(document.activeElement?.getAttribute("data-event-id")).toBe(id));
      expect(inView(document.activeElement!)).toBe(true);
    });

    test("each day's date precedes its events in reading order", async () => {
      await render(() => <Agenda dir={dir} />);
      const day = list().querySelector(`[data-date="${anchor.toString()}"]`)!;
      const date = day.querySelector("button")!.getBoundingClientRect();
      const event = day.querySelector("[data-event-id]")!.getBoundingClientRect();

      expect(dir === "ltr" ? event.left - date.right : date.left - event.right).toBeGreaterThan(0);
    });
  },
);

describe("the Solid scrolling agenda's navigation", () => {
  test("Next and Today jump the list to their date", async () => {
    await render(() => <Agenda weeks={1} />);
    const onTop = () =>
      days().find(
        (day) => day.getBoundingClientRect().bottom > list().getBoundingClientRect().top + 1,
      )?.dataset.date;
    expect(onTop()).toBe("2026-10-08");

    document.querySelector<HTMLElement>('[aria-label="Next period"]')!.click();
    await until(() => expect(title()).toBe("Oct 15 – 21, 2026"));
    await atRest(list());
    expect(onTop()).toBe("2026-10-15");

    document.querySelector<HTMLElement>('[aria-label="Today"]')!.click();
    await until(() => expect(title()).toBe("Oct 8 – 14, 2026"));
    await atRest(list());
    expect(onTop()).toBe(monthAnchor.toString());
  });
});

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

// A phone's touch screen and the reduced-motion preference need Chromium's emulation through CDP.
describe.runIf(server.browser === "chromium")(
  "a finger on a phone's Solid scrolling agenda",
  () => {
    beforeAll(async () => {
      await page.viewport(375, 667);
      await cdp().send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    });
    afterAll(async () => {
      await cdp().send("Emulation.setTouchEmulationEnabled", { enabled: false });
      await page.viewport(1280, 800);
    });

    test("the list scrolls on the block axis alone, and a swipe moves the anchor with it", async () => {
      await render(() => <Agenda />);
      expect(list().scrollWidth).toBe(list().clientWidth);
      const box = list().getBoundingClientRect();

      for (let step = 0; step < 4 && anchors.length === 0; step += 1) {
        await swipe([box.left + box.width / 2, box.bottom - 40], [30, -(box.height - 120)]);
        await atRest(list());
      }

      expect(anchors.length).toBeGreaterThan(0);
      expect(Temporal.PlainDate.compare(anchors.at(-1)!, anchor)).toBe(1);
      expect(list().scrollLeft).toBe(0);
    });

    test.each([
      ["up", -200, 1],
      ["down", 200, -1],
    ] as const)(
      "a swipe %s past the end of dates without events moves the calendar on that way",
      async (_, dy, sign) => {
        await render(() => <Agenda events={[]} weeks={1} />);
        const box = list().getBoundingClientRect();
        expect(title()).toBe("Oct 8 – 14, 2026");

        await swipe([box.left + box.width / 2, box.top + box.height / 2], [0, dy]);

        await until(() => expect(anchors.length).toBe(1));
        expect(Temporal.PlainDate.compare(anchors[0]!, anchor)).toBe(sign);
        await until(() => expect(title()).not.toBe("Oct 8 – 14, 2026"));
      },
    );

    test("with reduced motion, the loading spinner keeps still", async () => {
      await render(() => <Agenda events={[]} loading />);
      const spinner = () => list().querySelector('svg[class*="animate-spin"]')!;
      await until(() => expect(spinner()).not.toBeNull());
      expect(getComputedStyle(spinner()).animationName).toBe("spin");

      await cdp().send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-motion", value: "reduce" }],
      });
      try {
        expect(matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(true);
        expect(getComputedStyle(spinner()).animationName).toBe("none");
      } finally {
        await cdp().send("Emulation.setEmulatedMedia", { features: [] });
      }
    });
  },
);
