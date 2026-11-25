import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEvent,
} from "@moltenship/calendar-solid";
import { describe, expect, test } from "vite-plus/test";
import { cdp, page, server, userEvent } from "vite-plus/test/browser";

import {
  calendarEventColors,
  type CalendarEventColor,
} from "@registry/shared/calendar-theme/event-colors";
import { createAgendaView } from "@registry/list-view/agenda-view";

import { seriousViolations, setTheme, themes } from "../axe";
import { atRest, press, render, settled, until } from "./render";

// The Solid registry's agenda in a real browser, against what the React agenda's files check
// (long-agenda, rtl-layout, phone-layout, reduced-motion): its roles and names pass axe in both
// themes, keys page through 10,000 events keeping focus in view, it mirrors in RTL, its targets
// are 24 px on a phone, and its spinners keep still for reduced motion.

type Fixture = CalendarEvent<{ readonly color: CalendarEventColor }, string>;

const Calendar = createCalendar<Fixture>()({
  eventAdapter: createCanonicalEventAdapter<{ readonly color: CalendarEventColor }, string>(),
  views: [createAgendaView<Fixture>({ getEventColor: (event) => event.data.color })],
});

const anchor = Temporal.PlainDate.from("2026-10-08");
const inWebKit = server.browser === "webkit";
const titles = ["Standup", "Design review", "Lunch", "Focus time", "Gym", "1:1", "Planning"];

/** 10,000 events over two years from a year back, about fourteen a day, as the React file has. */
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

function Agenda(props: {
  readonly dir?: "ltr" | "rtl";
  readonly events?: readonly Fixture[];
  readonly loading?: boolean;
  readonly weeks?: number;
}) {
  return (
    <Calendar.Root
      defaultAnchorDate={anchor}
      defaultTimeZone="UTC"
      defaultView="agenda"
      direction={props.dir ?? "ltr"}
      events={props.events ?? events}
      locale="en-US"
      viewOptions={{ agenda: { loading: props.loading === true, weeks: props.weeks ?? 104 } }}
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <Calendar.Frame class="flex h-dvh flex-col" dir={props.dir ?? "ltr"}>
        <h1 class="border-b p-3 text-lg font-semibold">
          <Calendar.Title />
        </h1>
        <Calendar.Viewport class="min-h-0 flex-1">
          <Calendar.ActiveView />
        </Calendar.Viewport>
      </Calendar.Frame>
    </Calendar.Root>
  );
}

const list = () => document.querySelector<HTMLElement>('[data-slot="agenda-view"]')!;
const days = () => [...list().querySelectorAll<HTMLElement>("li[data-date]")];
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

describe.each(themes)("the Solid agenda, %s theme", (theme) => {
  test("has no serious violations with events, without, and loading", async () => {
    setTheme(theme);
    await render(() => <Agenda />);
    expect(await seriousViolations()).toEqual([]);

    await render(() => <Agenda events={[]} />);
    expect(list().querySelector('[role="group"]')).not.toBeNull();
    expect(await seriousViolations()).toEqual([]);

    await render(() => <Agenda events={[]} loading />);
    expect(list().textContent).toContain("Loading events");
    // The spinner turns until events arrive; the check waits for animations to finish.
    for (const animation of document.getAnimations()) animation.cancel();
    expect(await seriousViolations()).toEqual([]);
  });
});

describe.each(["ltr", "rtl"] as const)("the Solid agenda of 10,000 events, %s", (dir) => {
  test("renders only the days in view of two years of weeks", async () => {
    await render(() => <Agenda dir={dir} />);
    expect(days().length).toBeLessThan(16);
    expect(days()[0]?.getAttribute("aria-setsize")).toBe("367");

    list().scrollBy({ behavior: "instant", top: 120_000 });
    const inViewDay = () => days().find(inView)?.getAttribute("aria-posinset");
    await until(() => expect(Number(inViewDay())).toBeGreaterThan(100));
    expect(days().length).toBeLessThan(16);
    expect(document.querySelector('[data-calendar-part="title"]')?.textContent).toBe(
      "Oct 5, 2026 – Oct 1, 2028",
    );
  });

  // WebKit leaves the focused event out of view about half the time, as in the React file: #185.
  test.skipIf(inWebKit)(
    "keys move through events and days, keeping the focused event in view",
    async () => {
      await render(() => <Agenda dir={dir} />);
      const entry = list().querySelector<HTMLElement>('[tabindex="0"]')!;
      entry.focus();
      await settled();

      for (let step = 0; step < 40; step += 1) await press("ArrowDown");
      expect(document.activeElement?.getAttribute("data-slot")).toBe("calendar-event");
      await atRest(list());
      expect(inView(document.activeElement!)).toBe(true);

      const from = dayOf();
      for (let step = 0; step < 10; step += 1) await press("PageDown");
      expect(dayOf().toString()).toBe(from.add({ days: 10 }).toString());
      await atRest(list());
      expect(inView(document.activeElement!)).toBe(true);
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
    "real key presses page past the range without jumping the list",
    async () => {
      await render(() => <Agenda dir={dir} weeks={1} />);
      list().querySelector<HTMLElement>('[tabindex="0"]')!.focus();
      await settled();

      await userEvent.keyboard("{ArrowUp}");
      await until(() => expect(dayOf().toString()).toBe("2026-10-04"));
      for (let step = 1; step <= 6; step += 1) {
        await userEvent.keyboard("{PageDown}");
        const day = Temporal.PlainDate.from("2026-10-04").add({ days: step }).toString();
        await until(() => expect(dayOf().toString()).toBe(day));
        await atRest(list());
        expect(inView(document.activeElement!)).toBe(true);
      }
    },
  );

  test("each day's date precedes its events in reading order", async () => {
    await render(() => <Agenda dir={dir} />);
    const day = list().querySelector(`[data-date="${anchor.toString()}"]`)!;
    // The date's button, which opens the day, then the day's events.
    const date = day.querySelector("button")!.getBoundingClientRect();
    const event = day.querySelector("[data-event-id]")!.getBoundingClientRect();

    // Inline distance from the date to the event, in reading order.
    expect(dir === "ltr" ? event.left - date.right : date.left - event.right).toBeGreaterThan(0);
  });
});

// Chromium alone emulates a phone's touch screen and the reduced-motion preference through CDP.
describe.runIf(server.browser === "chromium")("in Chromium's emulation", () => {
  test("on a 375 px touch screen, events are 24 px targets with their time above the title", async () => {
    await page.viewport(375, 667);
    await cdp().send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    try {
      await render(() => <Agenda />);
      const targets = [...list().querySelectorAll<HTMLElement>("button, [data-event-id]")].filter(
        (element) => {
          const box = element.getBoundingClientRect();
          return box.width > 0 && box.bottom > 0 && box.top < innerHeight;
        },
      );
      expect(targets.length).toBeGreaterThan(0);
      const small = targets
        .map((element) => ({ box: element.getBoundingClientRect(), element }))
        .filter(({ box }) => box.width < 24 || box.height < 24)
        .map(({ element }) => element.getAttribute("aria-label") ?? element.textContent);
      expect(small).toEqual([]);

      // The row stacks: the time on top, the title under it.
      const event = list().querySelector<HTMLElement>("[data-event-id]")!;
      expect(getComputedStyle(event).flexDirection).toBe("column");
    } finally {
      await cdp().send("Emulation.setTouchEmulationEnabled", { enabled: false });
      await page.viewport(1280, 800);
    }
  });

  test("with reduced motion, the loading spinner keeps still", async () => {
    await render(() => <Agenda events={[]} loading />);
    const spinner = () => list().querySelector('svg[class*="animate-spin"]')!;
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
});
