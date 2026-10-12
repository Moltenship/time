// @vitest-environment jsdom

import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEvent,
  type CalendarResource,
} from "@moltenship/calendar";
import { RepeatIcon } from "lucide-react";
import type { ReactNode } from "react";
import { afterEach, expect, test, vi } from "vite-plus/test";

import { EventIcon } from "../calendar/event-chip";
import { createAgendaView } from "../list-view/agenda-view";
import { createMonthView } from "../month-view/month-view";
import { createResourceColumnsView } from "../resource-columns-view/resource-columns-view";
import {
  createTimelineDayView,
  createTimelineWeekView,
} from "../resource-timeline-view/resource-timeline-view";
import { createScrollingAgendaView } from "../scrolling-list-view/scrolling-agenda-view";
import { createScrollingMonthView } from "../scrolling-month-view/scrolling-month-view";
import { createScrollingWeekView } from "../scrolling-time-grid-view/scrolling-time-grid-view";
import { createWeekView } from "../time-grid-view/time-grid-view";
import { createYearView } from "../year-view/year-view";
import { click, render } from "./render";
import { StubResizeObserver } from "./timeline-fixtures";
import { ariaLabel, text } from "./view-fixtures";

type Fixture = CalendarEvent<{ readonly repeats: boolean }, string>;

/** An app's icon: a repeat mark on the events that repeat, and nothing on the others. */
const getEventIcon = (event: Fixture): ReactNode => (event.data.repeats ? <RepeatIcon /> : null);

function views(icon?: (event: Fixture) => ReactNode) {
  return [
    createWeekView<Fixture>({ getEventIcon: icon }),
    createMonthView<Fixture>({ getEventIcon: icon }),
    createYearView<Fixture>({ getEventIcon: icon }),
    createAgendaView<Fixture>({ getEventIcon: icon }),
    createResourceColumnsView<Fixture>({ getEventIcon: icon }),
    createTimelineWeekView<Fixture>({ getEventIcon: icon }),
    createTimelineDayView<Fixture>({ getEventIcon: icon }),
    createScrollingWeekView<Fixture>({ getEventIcon: icon }),
    createScrollingMonthView<Fixture>({ getEventIcon: icon }),
    createScrollingAgendaView<Fixture>({ getEventIcon: icon }),
  ] as const;
}

const eventAdapter = createCanonicalEventAdapter<{ readonly repeats: boolean }, string>();
const Plain = createCalendar<Fixture, CalendarResource<null>>()({
  eventAdapter,
  views: views(),
});
const WithIcons = createCalendar<Fixture, CalendarResource<null>>()({
  eventAdapter,
  views: views(getEventIcon),
});
type View = (typeof Plain.views)[number]["name"];

const resources: readonly CalendarResource<null>[] = [
  { data: null, id: "ada", title: "Ada" },
  { data: null, id: "grace", title: "Grace" },
];

function timed(id: string, start: string, end: string, repeats: boolean): Fixture {
  return {
    data: { repeats },
    end: Temporal.Instant.from(`2026-10-08T${end}Z`),
    id,
    kind: "timed",
    resourceIds: ["ada"],
    start: Temporal.Instant.from(`2026-10-08T${start}Z`),
    title: id,
  };
}

function allDay(id: string, start: string, end: string, repeats: boolean): Fixture {
  return {
    data: { repeats },
    end: Temporal.PlainDate.from(end),
    id,
    kind: "all-day",
    resourceIds: ["grace"],
    start: Temporal.PlainDate.from(start),
    title: id,
  };
}

// Thursday, October 8, 2026. Standup is short enough for the time grid's one-line block.
const events = [
  allDay("trip", "2026-10-06", "2026-10-09", true),
  allDay("offsite", "2026-10-08", "2026-10-09", false),
  timed("standup", "09:00", "09:30", true),
  timed("lunch", "12:00", "13:00", false),
  timed("planning", "14:00", "15:00", true),
];
const repeating = ["trip", "standup", "planning"];

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
  vi.unstubAllGlobals();
});

function screen(Calendar: typeof Plain, view: View) {
  return (
    <Calendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="UTC"
      defaultView={view}
      events={events}
      locale="en-US"
      now={Temporal.Instant.from("2026-10-08T08:00:00Z")}
      resources={resources}
      weekRules={{ firstDay: 7, minimalDays: 1, weekend: [6, 7] }}
    >
      <Calendar.ActiveView />
    </Calendar.Root>
  );
}

const icons = (root: ParentNode) => root.querySelectorAll('[data-slot="calendar-event-icon"]');

/**
 * Every rendered event chip, popovers included, with its accessible name and visible text, after
 * `open` shows the chips the view lists on demand.
 */
async function chips(
  Calendar: typeof Plain,
  view: View,
  open?: (container: HTMLElement) => Promise<void>,
) {
  const { container, unmount } = await render(screen(Calendar, view));
  cleanup = unmount;
  await open?.(container);
  const found = [...document.querySelectorAll<HTMLElement>("[data-event-id]")];
  return {
    elements: found,
    named: found.map((chip) => ({
      id: chip.getAttribute("data-event-id"),
      label: ariaLabel(chip),
      text: text(chip),
    })),
  };
}

/** Each chip of a repeating event shows one hidden icon right before its title; others none. */
function expectIcons(elements: readonly HTMLElement[]) {
  const ids = new Set(elements.map((chip) => chip.getAttribute("data-event-id")));
  expect([...ids].filter((id) => repeating.includes(id!))).not.toEqual([]);
  expect([...ids].filter((id) => !repeating.includes(id!))).not.toEqual([]);
  for (const chip of elements) {
    const id = chip.getAttribute("data-event-id")!;
    if (!repeating.includes(id)) {
      expect(icons(chip), id).toHaveLength(0);
      continue;
    }
    expect(icons(chip), id).toHaveLength(1);
    const icon = icons(chip)[0]!;
    expect(icon.getAttribute("aria-hidden")).toBe("true");
    expect(icon.querySelector("svg")).not.toBeNull();
    // Inline at the start of the title.
    expect(icon.previousSibling).toBeNull();
    expect(icon.nextSibling?.textContent).toBe(id);
  }
}

async function expectSameNamesWithIcons(
  view: View,
  open?: (container: HTMLElement) => Promise<void>,
) {
  const plain = await chips(Plain, view, open);
  expect(icons(document)).toHaveLength(0);
  await cleanup?.();
  const withIcons = await chips(WithIcons, view, open);

  expectIcons(withIcons.elements);
  // The icon is decorative: names and visible text stay as they were.
  expect(withIcons.named).toEqual(plain.named);
  return withIcons.elements;
}

test.each<View>(["week", "scrolling-week"])(
  "%s view: timed blocks, one-line blocks and all-day bars show the icon",
  async (view) => {
    const elements = await expectSameNamesWithIcons(view);
    const titleOf = (id: string) =>
      elements
        .find((chip) => chip.getAttribute("data-event-id") === id)!
        .querySelector('[data-slot="calendar-event-icon"]')!.parentElement!;

    // The two-line block's clamped title, the one-line block's title, and the all-day bar's.
    expect(titleOf("planning").className).toContain("line-clamp-2");
    expect(titleOf("standup").className).toContain("truncate");
    expect(titleOf("trip").className).toContain("truncate");
    expect(
      ariaLabel(elements.find((chip) => chip.getAttribute("data-event-id") === "standup")),
    ).toBe("standup, Thursday, October 8, 9:00 – 9:30 AM");
  },
);

test.each<View>(["month", "scrolling-month"])(
  "%s view: bars, items and the +N more list show the icon",
  async (view) => {
    const elements = await expectSameNamesWithIcons(view, async (container) => {
      await click(
        container.querySelector('[aria-label$="more events on Thursday, October 8, 2026"]'),
      );
    });

    const listed = document.querySelector('[data-slot="popover-content"]')!;
    expect(icons(listed)).toHaveLength(3);
    expect(elements.length).toBeGreaterThan(5);
  },
);

test("year view: the day's list shows the icon, and the dots stay dots", async () => {
  const elements = await expectSameNamesWithIcons("year", async (container) => {
    await click(container.querySelector('[role="gridcell"][data-date="2026-10-08"] button'));
  });

  expect(elements.map((chip) => chip.getAttribute("data-event-id"))).toHaveLength(events.length);
  expect(new Set(elements.map((chip) => chip.getAttribute("data-event-id")))).toEqual(
    new Set(events.map(({ id }) => id)),
  );
  expect(icons(document.querySelector('[data-slot="year-view"]')!)).toHaveLength(0);
});

test.each<View>(["agenda", "scrolling-agenda"])("%s view: rows show the icon", async (view) => {
  await expectSameNamesWithIcons(view);
});

test("resource columns view: timed blocks and all-day bars show the icon", async () => {
  const elements = await expectSameNamesWithIcons("resources");

  expect(elements.map((chip) => chip.getAttribute("data-event-id"))).toHaveLength(events.length);
  expect(new Set(elements.map((chip) => chip.getAttribute("data-event-id")))).toEqual(
    new Set(events.map(({ id }) => id)),
  );
});

test.each<View>(["timeline-week", "timeline-day"])("%s view: bars show the icon", async (view) => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
  await expectSameNamesWithIcons(view);
});

test("an event icon renders nothing without an icon", async () => {
  const { container, unmount } = await render(
    <>
      <EventIcon />
      <EventIcon>{null}</EventIcon>
      <EventIcon>{undefined}</EventIcon>
      <EventIcon>{false}</EventIcon>
      <EventIcon>{""}</EventIcon>
    </>,
  );
  cleanup = unmount;

  expect(container.innerHTML).toBe("");
});
