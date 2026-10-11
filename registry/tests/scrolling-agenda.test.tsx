// @vitest-environment jsdom

import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import { createScrollingAgendaView } from "../scrolling-list-view/scrolling-agenda-view";
import { click, press as pressOn, render } from "./render";
import {
  anchorDate,
  clock,
  createTestCalendar,
  text,
  timed,
  type ColoredEvent,
} from "./view-fixtures";

const Calendar = createTestCalendar(createScrollingAgendaView<ColoredEvent>({ weeks: 52 }));

/** 10,000 half-hour events over the two years either side of the anchor: about fourteen a day. */
const longRange: readonly ColoredEvent[] = Array.from({ length: 10_000 }, (_, index) => {
  const date = anchorDate.subtract({ weeks: 52 }).add({ days: index % 728 });
  const start = date.toZonedDateTime({
    plainTime: Temporal.PlainTime.from({ hour: 6 + Math.floor(index / 728) }),
    timeZone: "UTC",
  });
  return timed(
    `event-${index}`,
    start.toString({ timeZoneName: "never" }),
    start.add({ minutes: 30 }).toString({ timeZoneName: "never" }),
  );
});

/** The calendar's actions, to move it as an app would. */
let actions: ReturnType<typeof Calendar.useCalendarActions> | undefined;

function CaptureActions() {
  actions = Calendar.useCalendarActions();
  return null;
}

function Agenda({
  events = longRange,
  heldAnchor,
  loading = false,
  onAnchorDateChange,
  weeks = 52,
}: {
  readonly events?: readonly ColoredEvent[];
  /** A controlled anchor the app never moves. */
  readonly heldAnchor?: Temporal.PlainDate;
  readonly loading?: boolean;
  readonly onAnchorDateChange?: (date: Temporal.PlainDate) => void;
  readonly weeks?: number;
}) {
  return (
    <Calendar.Root
      {...(heldAnchor === undefined
        ? { defaultAnchorDate: anchorDate }
        : { anchorDate: heldAnchor })}
      clock={clock}
      defaultTimeZone="UTC"
      defaultView="scrolling-agenda"
      events={events}
      locale="en-US"
      onAnchorDateChange={onAnchorDateChange}
      viewOptions={{ "scrolling-agenda": { loading, weeks } }}
      weekRules={{ firstDay: 7, minimalDays: 1, weekend: [6, 7] }}
    >
      <CaptureActions />
      <Calendar.Title />
      <Calendar.TodayTrigger>Today</Calendar.TodayTrigger>
      <Calendar.ActiveView />
    </Calendar.Root>
  );
}

/** Where the view asked to scroll, in order. jsdom lays nothing out, so the tests move it. */
let scrolls: number[] = [];
let cleanup: (() => Promise<void>) | undefined;

beforeEach(() => {
  scrolls = [];
  HTMLElement.prototype.scrollTo = function (
    this: HTMLElement,
    options?: ScrollToOptions | number,
  ) {
    const { top = 0 } = options as ScrollToOptions;
    scrolls.push(top);
    this.scrollTop = top;
  } as HTMLElement["scrollTo"];
  // A 640px viewport over a list far taller, so scroll offsets aren't clamped to zero.
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(640);
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(1_000_000);
});

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
  actions = undefined;
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
});

/** Presses `key` on the focused element, as a keyboard would. */
const press = (key: string) => pressOn(document.activeElement, key);

async function show(element: React.ReactElement) {
  const screen = await render(element);
  cleanup = screen.unmount;
  return screen.container;
}

const scroller = () => document.querySelector<HTMLElement>('[data-slot="agenda-view"]')!;
const renderedDays = () =>
  [...document.querySelectorAll<HTMLElement>('[data-slot="agenda-view"] li[data-date]')].map(
    (day) => day.dataset.date,
  );
const title = () => text(document.querySelector('[data-calendar-part="title"]'));
const rowTop = (date: string) =>
  Number.parseFloat(document.querySelector<HTMLElement>(`li[data-date="${date}"]`)!.style.top);

/** Makes the list as tall as its rows, so the end of it, which fills the view, is as far as it scrolls. */
function fitScrollHeight() {
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    const rows = [...this.querySelectorAll<HTMLElement>(":scope > ol, :scope > div")];
    return Math.max(
      0,
      ...rows.map(
        (row) =>
          Number.parseFloat(row.style.top || "0") + Number.parseFloat(row.style.height || "0"),
      ),
    );
  });
}

/** Scrolls to the end of the list, as far as it goes, as the user would. */
const toEnd = () =>
  act(async () => {
    scroller().dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    scroller().scrollTop = scroller().scrollHeight - 640;
    scroller().dispatchEvent(new Event("scroll"));
  });

/** Scrolls the list as the user would: input, a scroll to `top`, then the scroll at rest. */
async function scrollTo(top: number) {
  await act(async () => {
    const element = scroller();
    element.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    element.scrollTop = top;
    element.dispatchEvent(new Event("scroll"));
    element.dispatchEvent(new Event("scrollend"));
  });
}

test("of 10,000 events over two years, renders only the days in view, numbered among all", async () => {
  await show(<Agenda />);
  const days = [...document.querySelectorAll<HTMLElement>("li[data-date]")];

  expect(title()).toBe("Oct 8, 2026 – Oct 6, 2027");
  expect(days.length).toBeLessThan(12);
  expect(document.querySelectorAll("[data-event-id]").length).toBeLessThan(160);
  // The anchor date is on top, the 365th of 728 days.
  const anchorDay = days.find((day) => day.dataset.date === "2026-10-08")!;
  expect(scroller().scrollTop).toBe(Number.parseFloat(anchorDay.style.top));
  expect(anchorDay.getAttribute("aria-posinset")).toBe("365");
  expect(days.every((day) => day.getAttribute("aria-setsize") === "728")).toBe(true);
});

test("keeps the focused day rendered while focus is in the list and the user scrolls away", async () => {
  await show(<Agenda />);
  const entry = document.querySelector<HTMLElement>('[data-slot="agenda-view"] [tabindex="0"]')!;
  expect(entry.closest("li[data-date]")?.closest("li[data-date]")?.getAttribute("data-date")).toBe(
    "2026-10-08",
  );
  await act(async () => entry.focus());

  await act(async () => {
    scroller().scrollTop = 40_000;
    scroller().dispatchEvent(new Event("scroll"));
  });

  expect(renderedDays()).toContain("2026-10-08");
  expect(renderedDays().length).toBeLessThan(14);
  expect(document.activeElement).toBe(entry);
});

test("moves the anchor to the day on top once a scroll comes to rest", async () => {
  const onAnchorDateChange = vi.fn<(date: Temporal.PlainDate) => void>();
  await show(<Agenda onAnchorDateChange={onAnchorDateChange} />);
  const top = rowTop("2026-10-11");

  await scrollTo(top + 20);

  expect(onAnchorDateChange.mock.calls.map(([date]) => date.toString())).toEqual(["2026-10-11"]);
  expect(title()).toBe("Oct 11, 2026 – Oct 9, 2027");
  // The list stays where the user left it.
  expect(scroller().scrollTop).toBe(rowTop("2026-10-11") + 20);
});

test("scrolls a date the app picks to the top, and Today back", async () => {
  await show(<Agenda />);

  await act(async () => actions!.setAnchorDate(Temporal.PlainDate.from("2027-03-01")));

  expect(title()).toBe("Mar 1, 2027 – Feb 27, 2028");
  expect(scroller().scrollTop).toBe(rowTop("2027-03-01"));

  await click(document.querySelector('[data-calendar-part="today-trigger"]'));

  expect(title()).toBe("Oct 8, 2026 – Oct 6, 2027");
  expect(scroller().scrollTop).toBe(rowTop("2026-10-08"));
});

test("Today scrolls back to an anchor the app holds while the user scrolls", async () => {
  await show(<Agenda heldAnchor={anchorDate} />);
  const anchorTop = rowTop("2026-10-08");

  await scrollTo(anchorTop + 5000);
  expect(title()).toBe("Oct 8, 2026 – Oct 6, 2027");
  expect(scroller().scrollTop).toBe(anchorTop + 5000);

  await click(document.querySelector('[data-calendar-part="today-trigger"]'));

  expect(scroller().scrollTop).toBe(anchorTop);
});

test("says events are loading at the end of the list, or in its place without any", async () => {
  const container = await show(<Agenda events={[]} loading />);

  expect(text(container.querySelector('[role="group"]'))).toBe(
    "Loading eventsFetching what's scheduled for October 8, 2026 – October 6, 2027.",
  );
  expect(container.querySelector('[role="group"]')?.getAttribute("aria-busy")).toBe("true");

  const standup = timed("standup", "2026-10-08T09:00Z", "2026-10-08T09:30Z");
  await act(async () => cleanup?.());
  await show(<Agenda events={[standup]} loading />);
  expect(document.querySelector("ol")?.getAttribute("aria-busy")).toBe("true");
  expect(text(document.querySelector("ol + div"))).toBe("Loading events…");

  await act(async () => cleanup?.());
  await show(<Agenda events={[standup]} />);
  // The load range runs a page past the year in view.
  expect(text(document.querySelector("ol + div"))).toBe(
    "Nothing more is scheduled through Wednesday, October 4, 2028.",
  );
});

test("server markup starts at the anchor date and hydrates as is", async () => {
  const markup = renderToString(<Agenda />);
  const container = document.createElement("div");
  container.innerHTML = markup;

  expect(container.querySelector("li[data-date]")?.getAttribute("data-date")).toBe("2026-10-08");

  document.body.append(container);
  const errors: unknown[] = [];
  const root = await act(async () =>
    hydrateRoot(container, <Agenda />, { onRecoverableError: (error) => errors.push(error) }),
  );
  cleanup = async () => {
    await act(async () => root.unmount());
    container.remove();
  };

  expect(errors).toEqual([]);
  // Once hydrated, the days above join without moving the anchor's day.
  expect(renderedDays()).toContain("2026-10-07");
  expect(scroller().scrollTop).toBe(rowTop("2026-10-08"));
});

test("keys page past the range and move focus on, leaving the scrolling to focus", async () => {
  await show(
    <Agenda
      events={[
        timed("standup", "2026-10-08T09:00Z", "2026-10-08T09:30Z"),
        timed("review", "2026-10-20T15:00Z", "2026-10-20T16:00Z"),
      ]}
      weeks={1}
    />,
  );
  await act(async () => document.querySelector<HTMLElement>('[data-event-id="standup"]')!.focus());
  const before = scrolls.length;

  await press("ArrowDown");
  expect(title()).toBe("Oct 15 – 21, 2026");
  expect(document.activeElement?.getAttribute("data-event-id")).toBe("review");
  await press("ArrowUp");
  expect(title()).toBe("Oct 8 – 14, 2026");
  expect(document.activeElement?.getAttribute("data-event-id")).toBe("standup");
  // The list never jumped to the anchor date: focus scrolls an event into view.
  expect(scrolls.length).toBe(before);
});

test("keeps the day on top in place when days change above and below it", async () => {
  const day = (date: string, count = 3) =>
    Array.from({ length: count }, (_, index) =>
      timed(`${date}-${index}`, `${date}T0${index + 6}:00Z`, `${date}T0${index + 6}:30Z`),
    );
  const before = ["2026-10-08", "2026-10-10", "2026-10-14", "2026-10-16", "2026-10-30"];
  const screen = await render(<Agenda events={before.flatMap((date) => day(date))} weeks={4} />);
  cleanup = screen.unmount;
  await act(async () => {
    scroller().dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    scroller().scrollTop = rowTop("2026-10-14") + 20;
    scroller().dispatchEvent(new Event("scroll"));
  });

  // A day comes in above the view and another leaves below it: as many rows, the same at the ends.
  const after = ["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-14", "2026-10-30"];
  await screen.rerender(<Agenda events={after.flatMap((date) => day(date))} weeks={4} />);

  expect(scroller().scrollTop).toBe(rowTop("2026-10-14") + 20);
});

test("scrolling past either end of the loaded days crosses weeks without events", async () => {
  await show(
    <Agenda
      events={[
        timed("standup", "2026-10-08T09:00Z", "2026-10-08T09:30Z"),
        timed("review", "2026-11-19T15:00Z", "2026-11-19T16:00Z"),
      ]}
      weeks={1}
    />,
  );
  fitScrollHeight();
  const scrollToEnd = () =>
    act(async () => {
      scroller().dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
      scroller().scrollTop = scroller().scrollHeight - 640;
      scroller().dispatchEvent(new Event("scroll"));
    });
  /** A wheel gesture, which moves the calendar once; the next one moves it again. */
  const wheel = async (deltaY: number) => {
    await act(async () =>
      scroller().dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY })),
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 200)));
  };

  await scrollToEnd();
  await wheel(100);
  expect(title()).toBe("Oct 9 – 15, 2026");
  await wheel(100);
  // Past the loaded days with none left, the end of the list says so, and still moves on.
  expect(title()).toBe("Oct 16 – 22, 2026");
  expect(text(document.querySelector('[role="group"]'))).toBe(
    "No eventsNothing is scheduled for October 16 – 22.",
  );
  await wheel(100);
  await wheel(100);
  await wheel(100);
  expect(title()).toBe("Nov 6 – 12, 2026");
  // The weeks shown are still empty, as their empty state says on top, and the next day with
  // events has loaded below it.
  expect(scroller().scrollTop).toBe(0);
  expect(text(document.querySelector('[role="group"]'))).toBe(
    "No eventsNothing is scheduled for November 6 – 12.",
  );
  expect(renderedDays()).toEqual(["2026-11-19"]);

  // Back up, past the first loaded day, a week at a time until the first event loads.
  await act(async () => {
    scroller().dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    scroller().scrollTop = 0;
    scroller().dispatchEvent(new Event("scroll"));
  });
  const titles = [title()];
  while (!renderedDays().includes("2026-10-08") && titles.length < 10) {
    await wheel(-100);
    titles.push(title());
  }
  // On top is the empty state of the weeks shown, so resting there keeps the anchor; each gesture
  // then moves a week.
  expect(titles).toEqual([
    "Nov 6 – 12, 2026",
    "Oct 30 – Nov 5, 2026",
    "Oct 23 – 29, 2026",
    "Oct 16 – 22, 2026",
    "Oct 9 – 15, 2026",
  ]);
  expect(renderedDays()).toContain("2026-10-08");
});

/** A touch at `clientY` on the list; jsdom's events carry it as a plain property. */
function touch(type: "touchend" | "touchmove" | "touchstart", clientY = 0) {
  return act(async () => {
    scroller().dispatchEvent(
      Object.assign(new Event(type, { bubbles: true }), { touches: [{ clientY }] }),
    );
  });
}

const settleTime = () => act(() => new Promise((resolve) => setTimeout(resolve, 200)));

test("past the end while events load, the list holds the date it moved to", async () => {
  fitScrollHeight();
  const screen = await render(<Agenda events={[]} weeks={1} />);
  cleanup = screen.unmount;
  // Below the empty state, the end of the list, where scrolling on moves the calendar.
  await toEnd();
  await act(async () =>
    scroller().dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 100 })),
  );
  expect(title()).toBe("Oct 15 – 21, 2026");

  const days = ["2026-10-08", "2026-10-15", "2026-10-22"];
  await screen.rerender(
    <Agenda
      events={days.map((date) => timed(date, `${date}T09:00Z`, `${date}T10:00Z`))}
      weeks={1}
    />,
  );

  expect(title()).toBe("Oct 15 – 21, 2026");
  expect(scroller().scrollTop).toBe(rowTop("2026-10-15"));
});

test("a finger held still mid-scroll goes on moving the anchor when it moves again", async () => {
  await show(<Agenda />);
  await touch("touchstart", 400);
  await act(async () => {
    scroller().scrollTop = rowTop("2026-10-09") + 10;
    scroller().dispatchEvent(new Event("scroll"));
  });
  await settleTime();
  expect(title()).toBe("Oct 9, 2026 – Oct 7, 2027");

  // Still the same touch: the finger moves on without lifting.
  await touch("touchmove", 200);
  await act(async () => {
    scroller().scrollTop = rowTop("2026-10-11") + 10;
    scroller().dispatchEvent(new Event("scroll"));
    scroller().dispatchEvent(new Event("scrollend"));
  });
  expect(title()).toBe("Oct 11, 2026 – Oct 9, 2027");
  await touch("touchend");
});

test("a swipe past the end of the loaded days moves a page once, until the finger lifts", async () => {
  fitScrollHeight();
  await show(<Agenda events={[]} weeks={1} />);
  await toEnd();

  await touch("touchstart", 400);
  await touch("touchmove", 360);
  expect(title()).toBe("Oct 15 – 21, 2026");
  await settleTime();
  await touch("touchmove", 320);
  expect(title()).toBe("Oct 15 – 21, 2026");
  await touch("touchend");

  await toEnd();
  await touch("touchstart", 400);
  await touch("touchmove", 360);
  expect(title()).toBe("Oct 22 – 28, 2026");
});

const arriving = ["2026-10-08", "2026-10-15", "2026-10-22"].map((date) =>
  timed(date, `${date}T09:00Z`, `${date}T10:00Z`),
);

test("the rest of a wheel gesture past the end keeps the date it moved to", async () => {
  fitScrollHeight();
  const screen = await render(<Agenda events={[]} weeks={1} />);
  cleanup = screen.unmount;
  await toEnd();
  // Two wheel events of one gesture.
  for (let step = 0; step < 2; step += 1) {
    await act(async () =>
      scroller().dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 100 })),
    );
  }
  expect(title()).toBe("Oct 15 – 21, 2026");

  await screen.rerender(<Agenda events={arriving} weeks={1} />);

  expect(title()).toBe("Oct 15 – 21, 2026");
  expect(scroller().scrollTop).toBe(rowTop("2026-10-15"));
});

test("keys paging from the empty state hold the date, and focus moves to its events", async () => {
  fitScrollHeight();
  const screen = await render(<Agenda events={[]} weeks={1} />);
  cleanup = screen.unmount;
  await act(async () => document.querySelector<HTMLElement>('[role="group"]')!.focus());

  await press("ArrowDown");
  expect(title()).toBe("Oct 15 – 21, 2026");
  expect(document.activeElement?.getAttribute("role")).toBe("group");

  await screen.rerender(<Agenda events={arriving} weeks={1} />);

  expect(title()).toBe("Oct 15 – 21, 2026");
  expect(scroller().scrollTop).toBe(rowTop("2026-10-15"));
  expect(document.activeElement?.getAttribute("data-event-id")).toBe("2026-10-15");
});

test("the empty state keeps focus until days come in from the anchor date, then hands it on", async () => {
  fitScrollHeight();
  const october7 = timed("2026-10-07", "2026-10-07T09:00Z", "2026-10-07T10:00Z");
  const october8 = timed("2026-10-08", "2026-10-08T09:00Z", "2026-10-08T10:00Z");
  const screen = await render(<Agenda events={[]} weeks={1} />);
  cleanup = screen.unmount;
  await act(async () => document.querySelector<HTMLElement>('[role="group"]')!.focus());

  // A day before the anchor date loads: the weeks shown are still empty.
  await screen.rerender(<Agenda events={[october7]} weeks={1} />);
  expect(document.activeElement?.getAttribute("role")).toBe("group");

  await screen.rerender(<Agenda events={[october7, october8]} weeks={1} />);
  expect(document.activeElement?.getAttribute("data-event-id")).toBe("2026-10-08");
});

test("turning the wheel back as days load in scrolls them, not the date it moved to", async () => {
  fitScrollHeight();
  const screen = await render(<Agenda events={[]} weeks={1} />);
  cleanup = screen.unmount;
  const wheel = (deltaY: number) =>
    act(async () => scroller().dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY })));
  await toEnd();
  await wheel(100);
  await screen.rerender(<Agenda events={arriving} weeks={1} />);
  expect(scroller().scrollTop).toBe(rowTop("2026-10-15"));

  // Still the same gesture, now turned back up through the days that loaded.
  await wheel(-100);
  const scrolledTo = rowTop("2026-10-15") - 40;
  await act(async () => {
    scroller().scrollTop = scrolledTo;
    scroller().dispatchEvent(new Event("scroll"));
  });
  await screen.rerender(<Agenda events={arriving} weeks={1} />);

  expect(scroller().scrollTop).toBe(scrolledTo);
});

test("weeks shown without events keep their empty state among the days around them", async () => {
  const on = (date: string) => timed(date, `${date}T09:00Z`, `${date}T10:00Z`);
  const screen = await render(<Agenda events={[on("2026-10-07"), on("2026-10-20")]} weeks={1} />);
  cleanup = screen.unmount;
  const stops = () => [...document.querySelectorAll('[data-slot="agenda-view"] [tabindex="0"]')];
  const group = document.querySelector<HTMLElement>('[role="group"]')!;

  // An item between October 7 and October 20, where October 8 – 14 fall, and where Tab lands.
  const items = [...document.querySelectorAll('[data-slot="agenda-view"] > ol > li')];
  expect(items.map((item) => item.getAttribute("data-date") ?? text(item))).toEqual([
    "2026-10-07",
    "No eventsNothing is scheduled for October 8 – 14.",
    "2026-10-20",
  ]);
  expect(items.map((item) => item.getAttribute("aria-posinset"))).toEqual(["1", "2", "3"]);
  expect(items.every((item) => item.getAttribute("aria-setsize") === "3")).toBe(true);
  expect(stops()).toEqual([group]);

  await act(async () => group.focus());
  // A day after the weeks shown leaves them empty, and the empty state keeps focus.
  await screen.rerender(
    <Agenda events={[on("2026-10-07"), on("2026-10-20"), on("2026-10-21")]} weeks={1} />,
  );
  expect(document.activeElement?.getAttribute("role")).toBe("group");

  await screen.rerender(
    <Agenda events={[on("2026-10-07"), on("2026-10-09"), on("2026-10-20")]} weeks={1} />,
  );
  expect(document.activeElement?.getAttribute("data-event-id")).toBe("2026-10-09");
});

test("the empty state stays on top as days come in after the weeks shown", async () => {
  fitScrollHeight();
  const screen = await render(<Agenda events={[]} weeks={1} />);
  cleanup = screen.unmount;
  // The mouse is down in the list, which lets go of the date the list held on top.
  await act(async () => {
    scroller().dispatchEvent(
      Object.assign(new Event("pointerdown", { bubbles: true }), { pointerType: "mouse" }),
    );
    scroller().dispatchEvent(new Event("scroll"));
  });

  await screen.rerender(
    <Agenda events={[timed("review", "2026-10-20T09:00Z", "2026-10-20T10:00Z")]} weeks={1} />,
  );
  await act(async () => scroller().dispatchEvent(new Event("scrollend")));

  // The empty state is now an item before October 20, and still on top.
  expect(scroller().scrollTop).toBe(0);
  expect(
    document.querySelector('[data-slot="agenda-view"] > ol > li')?.getAttribute("role"),
  ).toBeNull();
  expect(text(document.querySelector('[data-slot="agenda-view"] > ol > li'))).toBe(
    "No eventsNothing is scheduled for October 8 – 14.",
  );
  expect(title()).toBe("Oct 8 – 14, 2026");
});

test("a day arriving in the empty weeks shown takes their empty state's place on top", async () => {
  fitScrollHeight();
  const screen = await render(<Agenda events={[]} weeks={1} />);
  cleanup = screen.unmount;
  await act(async () => {
    scroller().dispatchEvent(
      Object.assign(new Event("pointerdown", { bubbles: true }), { pointerType: "mouse" }),
    );
    scroller().dispatchEvent(new Event("scroll"));
  });

  await screen.rerender(
    <Agenda events={[timed("lunch", "2026-10-10T12:00Z", "2026-10-10T13:00Z")]} weeks={1} />,
  );
  await act(async () => scroller().dispatchEvent(new Event("scrollend")));

  expect(scroller().scrollTop).toBe(rowTop("2026-10-10"));
  expect(title()).toBe("Oct 8 – 14, 2026");
});

test("coming back to a held anchor's day tells the owner, so a late scroll can't win", async () => {
  const onAnchorDateChange = vi.fn<(date: Temporal.PlainDate) => void>();
  const held = (date: string) => (
    <Agenda heldAnchor={Temporal.PlainDate.from(date)} onAnchorDateChange={onAnchorDateChange} />
  );
  const screen = await render(held("2026-10-08"));
  cleanup = screen.unmount;
  const anchorTop = rowTop("2026-10-08");

  await scrollTo(rowTop("2026-10-11") + 10);
  await scrollTo(anchorTop);

  expect(onAnchorDateChange.mock.calls.map(([date]) => date.toString())).toEqual([
    "2026-10-11",
    "2026-10-08",
  ]);
  // An owner that commits the earlier scroll anyway moves the list there, as navigation.
  await screen.rerender(held("2026-10-11"));
  expect(title()).toBe("Oct 11, 2026 – Oct 9, 2027");
  expect(scroller().scrollTop).toBe(rowTop("2026-10-11"));
});
