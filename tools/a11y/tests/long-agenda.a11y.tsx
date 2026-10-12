import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEvent,
} from "@moltenship/calendar";
import { act } from "react";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { CalendarToolbar } from "@registry/calendar/calendar-toolbar";
import { createAgendaView } from "@registry/list-view/agenda-view";
import { createScrollingAgendaView } from "@registry/scrolling-list-view/scrolling-agenda-view";

import { seriousViolations, setTheme, themes } from "./axe";
import { press, render } from "./render";

type Fixture = CalendarEvent<null, string>;

const Calendar = createCalendar<Fixture>()({
  eventAdapter: createCanonicalEventAdapter<null, string>(),
  views: [createScrollingAgendaView<Fixture>(), createAgendaView<Fixture>()],
});
type View = (typeof Calendar.views)[number]["name"];

const anchor = Temporal.PlainDate.from("2026-10-08");
const titles = ["Standup", "Design review", "Lunch", "Focus time", "Gym", "1:1", "Planning"];

/**
 * 10,000 events over two years from a year back: about fourteen a day, half an hour to two hours
 * long, with a three-day offsite every few weeks, so days differ in height.
 */
const events: readonly Fixture[] = Array.from({ length: 10_000 }, (_, index): Fixture => {
  const date = anchor.subtract({ weeks: 52 }).add({ days: index % 728 });
  const id = `event-${index}`;
  if (index % 728 === index && index % 23 === 0) {
    return {
      data: null,
      end: date.add({ days: 3 }),
      id,
      kind: "all-day",
      start: date,
      title: "Offsite",
    };
  }
  const start = date
    .toZonedDateTime({ plainTime: { hour: 6 + Math.floor(index / 728) }, timeZone: "UTC" })
    .toInstant();
  const minutes = 30 * (1 + (index % 4));
  const title = titles[index % titles.length]!;
  return { data: null, end: start.add({ minutes }), id, kind: "timed", start, title };
});

const anchors: Temporal.PlainDate[] = [];

function LongAgenda({
  dir = "ltr",
  loading = false,
  view = "scrolling-agenda",
  weeks = 52,
}: {
  readonly dir?: "ltr" | "rtl";
  readonly loading?: boolean;
  readonly view?: View;
  readonly weeks?: number;
}) {
  return (
    <Calendar.Root
      defaultAnchorDate={anchor}
      defaultTimeZone="UTC"
      defaultView={view}
      direction={dir}
      events={events}
      locale="en-US"
      now={Temporal.Instant.from("2026-10-08T10:20:00Z")}
      onAnchorDateChange={(date) => anchors.push(date)}
      viewOptions={{ agenda: { loading, weeks }, "scrolling-agenda": { loading, weeks } }}
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <Calendar.Frame className="flex h-dvh flex-col" dir={dir}>
        <CalendarToolbar calendar={Calendar} className="border-b" />
        <Calendar.Viewport className="min-h-0 flex-1">
          <Calendar.ActiveView />
        </Calendar.Viewport>
      </Calendar.Frame>
    </Calendar.Root>
  );
}

afterEach(() => {
  anchors.length = 0;
});

const settled = { interval: 50, timeout: 3000 };
const list = () => document.querySelector<HTMLElement>('[data-slot="agenda-view"]')!;
const days = () => [...list().querySelectorAll<HTMLElement>("li[data-date]")];
const title = () => document.querySelector('[data-calendar-part="title"]')?.textContent;

/** Scrolls the list by `pixels` as a wheel does, and lets the scroll come to rest. */
async function scrollList(pixels: number) {
  const before = anchors.length;
  await act(async () => {
    list().dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: pixels }));
    list().scrollBy({ behavior: "instant", top: pixels });
  });
  await vi.waitFor(() => expect(anchors.length).toBeGreaterThan(before), settled);
}

/** Whether `element` is inside the list's visible box. */
function inView(element: Element) {
  const box = list().getBoundingClientRect();
  const { bottom, top } = element.getBoundingClientRect();
  return top >= box.top - 1 && bottom <= box.bottom + 1;
}

describe.each(["ltr", "rtl"] as const)(
  "a scrolling agenda of 10,000 events over two years, %s",
  (dir) => {
    test("renders only the days in view as the list scrolls months on and back", async () => {
      await render(<LongAgenda dir={dir} />);
      expect(title()).toBe("Oct 8, 2026 – Oct 6, 2027");
      expect(days()[0]?.getAttribute("aria-setsize")).toBe("728");

      // Each step moves the anchor, which projects the year of loaded dates again: four steps of
      // about five weeks each cross the months without paying for more of them.
      for (let step = 0; step < 4; step += 1) {
        await scrollList(18_000);
        expect(days().length).toBeLessThan(16);
        expect(list().querySelectorAll("[data-event-id]").length).toBeLessThan(200);
      }
      // Each day is about 500px tall: the anchor followed the list months on.
      expect(
        Temporal.PlainDate.compare(anchors.at(-1)!, Temporal.PlainDate.from("2026-12-01")),
      ).toBe(1);
      const top = days().find(
        (day) => day.getBoundingClientRect().bottom > list().getBoundingClientRect().top + 1,
      )!;
      expect(top.dataset.date).toBe(anchors.at(-1)!.toString());

      for (let step = 0; step < 4; step += 1) await scrollList(-18_000);
      expect(days().length).toBeLessThan(16);
    });

    test("keys move through events and days, keeping the focused event in view", async () => {
      await render(<LongAgenda dir={dir} />);
      const entry = list().querySelector<HTMLElement>('[tabindex="0"]')!;
      await act(async () => entry.focus());
      expect(entry.closest("li[data-date]")?.getAttribute("data-date")).toBe("2026-10-08");

      const dayOf = () =>
        Temporal.PlainDate.from(
          document.activeElement!.closest("li")!.parentElement!.closest("li")!.dataset.date!,
        );
      for (let step = 0; step < 40; step += 1) await press("ArrowDown");
      expect(document.activeElement?.getAttribute("data-slot")).toBe("calendar-event");
      expect(Temporal.PlainDate.compare(dayOf(), anchor)).toBe(1);
      expect(inView(document.activeElement!)).toBe(true);

      const from = dayOf();
      for (let step = 0; step < 10; step += 1) await press("PageDown");
      expect(dayOf().toString()).toBe(from.add({ days: 10 }).toString());
      expect(inView(document.activeElement!)).toBe(true);
      await press("PageUp");
      expect(dayOf().toString()).toBe(from.add({ days: 9 }).toString());
      await press("End");
      expect(inView(document.activeElement!)).toBe(true);
      await press("Home");
      expect(inView(document.activeElement!)).toBe(true);
      expect(days().length).toBeLessThan(16);
    });

    test("keys paging past the range move focus on without jumping the list", async () => {
      // One week from the anchor date, so a few days of keys cross into the next.
      await render(<LongAgenda dir={dir} weeks={1} />);
      const dayOf = () =>
        Temporal.PlainDate.from(
          document.activeElement!.closest("li")!.parentElement!.closest("li")!.dataset.date!,
        );
      await act(async () => list().querySelector<HTMLElement>('[tabindex="0"]')!.focus());

      // Real key presses: browsers run microtasks between an event's listeners, unlike a dispatch
      // from a script, and the list tells its own keys apart from other requests across them.
      // Back past the anchor date: the last event of the day before, in view.
      await userEvent.keyboard("{ArrowUp}");
      await vi.waitFor(() => expect(dayOf().toString()).toBe("2026-10-07"));
      expect(inView(document.activeElement!)).toBe(true);
      // On past the week's end, a day at a time.
      for (let step = 1; step <= 10; step += 1) {
        await userEvent.keyboard("{PageDown}");
        const day = Temporal.PlainDate.from("2026-10-07").add({ days: step }).toString();
        await vi.waitFor(() => expect(dayOf().toString()).toBe(day));
        expect(inView(document.activeElement!)).toBe(true);
      }
    });

    test("focus leaves with its day's row and comes back with it", async () => {
      // Two weeks either way, so a few scrolls take the focused day out of the list.
      await render(<LongAgenda dir={dir} weeks={2} />);
      const entry = list().querySelector<HTMLElement>('[tabindex="0"]')!;
      const id = entry.getAttribute("data-event-id");
      await act(async () => entry.focus());

      while (document.activeElement === entry) await scrollList(3000);
      expect(document.querySelector(`[data-event-id="${id}"]`)).toBeNull();
      expect(
        Temporal.PlainDate.compare(anchors.at(-1)!, Temporal.PlainDate.from("2026-10-22")),
      ).toBe(1);

      while (document.querySelector(`[data-event-id="${id}"]`) === null) await scrollList(-3000);
      await vi.waitFor(() =>
        expect(document.activeElement?.getAttribute("data-event-id")).toBe(id),
      );
      expect(inView(document.activeElement!)).toBe(true);
    });
  },
);

test("the paged agenda renders only the days in view of two years of weeks", async () => {
  await render(<LongAgenda view="agenda" weeks={104} />);
  expect(days().length).toBeLessThan(16);
  // The events run a year on from the anchor's week, which starts on Monday, October 5.
  expect(days()[0]?.getAttribute("aria-setsize")).toBe("367");

  await act(async () => list().scrollBy({ behavior: "instant", top: 120_000 }));
  // The first and last days stay rendered, as where focus enters; the rest are those in view.
  const inViewDay = () => days().find(inView)?.getAttribute("aria-posinset");
  await vi.waitFor(() => expect(Number(inViewDay())).toBeGreaterThan(100));
  expect(days().length).toBeLessThan(16);
  // A paged agenda stays put: scrolling never moves its dates.
  expect(title()).toBe("Oct 5, 2026 – Oct 1, 2028");
});

describe.each(themes)("long agenda, %s theme", (theme) => {
  test("has no serious violations, paged, scrolling, and loading more", async () => {
    setTheme(theme);
    await render(<LongAgenda view="agenda" weeks={104} />);
    expect(await seriousViolations()).toEqual([]);

    await render(<LongAgenda />);
    expect(await seriousViolations()).toEqual([]);

    await render(<LongAgenda loading />);
    // The end of the list, where it says events are loading.
    await act(async () => {
      list().dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
      list().scrollTo({ behavior: "instant", top: list().scrollHeight });
    });
    await vi.waitFor(() => expect(list().textContent).toContain("Loading events…"));
    // The spinner turns until events arrive; the check waits for animations to finish.
    for (const animation of document.getAnimations()) animation.cancel();
    expect(await seriousViolations()).toEqual([]);
  });
});
