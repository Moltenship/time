import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEvent,
  type CalendarResource,
} from "@moltenship/calendar";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { cdp, page, server } from "vite-plus/test/browser";

import { CalendarToolbar } from "@registry/calendar/calendar-toolbar";
import { ViewSwitcher } from "@registry/calendar/view-switcher";
import {
  calendarEventColors,
  type CalendarEventColor,
} from "@registry/calendar-theme/event-colors";
import { createAgendaView } from "@registry/list-view/agenda-view";
import { createMonthView } from "@registry/month-view/month-view";
import { createResourceColumnsView } from "@registry/resource-columns-view/resource-columns-view";
import { createTimelineDayView } from "@registry/resource-timeline-view/resource-timeline-view";
import { createScrollingMonthView } from "@registry/scrolling-month-view/scrolling-month-view";
import { createScrollingThreeDayView } from "@registry/scrolling-time-grid-view/scrolling-time-grid-view";
import {
  createDayView,
  createThreeDayView,
  createWeekView,
} from "@registry/time-grid-view/time-grid-view";
import { TooltipProvider } from "@registry/ui/tooltip";
import { createYearView } from "@registry/year-view/year-view";

import { render, until } from "./render";

type Fixture = CalendarEvent<{ readonly color: CalendarEventColor }, string>;

const getEventColor = (event: Fixture) => event.data.color;
const Calendar = createCalendar<Fixture, CalendarResource<null>>()({
  eventAdapter: createCanonicalEventAdapter<{ readonly color: CalendarEventColor }, string>(),
  views: [
    createDayView<Fixture>({ getEventColor }),
    createThreeDayView<Fixture>({ dayView: "day", getEventColor }),
    createScrollingThreeDayView<Fixture>({ getEventColor }),
    createWeekView<Fixture>({ dayView: "day", getEventColor }),
    createMonthView<Fixture>({ getEventColor }),
    createScrollingMonthView<Fixture>({ getEventColor }),
    createYearView<Fixture>({ getEventColor }),
    createAgendaView<Fixture>({ getEventColor }),
    createResourceColumnsView<Fixture>({ getEventColor }),
    createTimelineDayView<Fixture>({ getEventColor }),
  ],
});
type View = (typeof Calendar.views)[number]["name"];

const resources: readonly CalendarResource<null>[] = [
  { data: null, id: "ada", title: "Ada" },
  { data: null, id: "grace", title: "Grace" },
  { data: null, id: "orchid", title: "Orchid" },
];

const firstMeeting = Temporal.Instant.from("2026-10-08T08:00:00Z");
const firstCall = Temporal.Instant.from("2026-10-05T15:00:00Z");

/**
 * Every palette colour as a 45-minute meeting on the anchor day and a 30-minute call across the
 * week, two 15-minute events back to back, and all-day bars, one into the next week: month cells
 * fill and show "+N more".
 */
const events: readonly Fixture[] = [
  ...(["Standup", "Check-in"] as const).map((title, index) => ({
    data: { color: "green" as const },
    end: firstMeeting.add({ hours: 2, minutes: 45 + 15 * index }),
    id: title,
    kind: "timed" as const,
    start: firstMeeting.add({ hours: 2, minutes: 30 + 15 * index }),
    title,
  })),
  ...calendarEventColors.map((color, index) => ({
    data: { color },
    end: firstMeeting.add({ hours: index, minutes: 45 }),
    id: `${color} meeting`,
    kind: "timed" as const,
    resourceIds: [resources[index % resources.length]!.id],
    start: firstMeeting.add({ hours: index }),
    title: `${color} meeting`,
  })),
  ...calendarEventColors.map((color, index) => ({
    data: { color },
    end: firstCall.add({ hours: 24 * (index % 7), minutes: 30 }),
    id: `${color} call`,
    kind: "timed" as const,
    start: firstCall.add({ hours: 24 * (index % 7) }),
    title: `${color} call`,
  })),
  ...(
    [
      ["teal", "Conference", "2026-10-06", "2026-10-10"],
      ["orange", "Holiday", "2026-10-08", "2026-10-09"],
      ["purple", "Offsite", "2026-10-10", "2026-10-14"],
    ] as const
  ).map(([color, title, start, end]) => ({
    data: { color },
    end: Temporal.PlainDate.from(end),
    id: title,
    kind: "all-day" as const,
    start: Temporal.PlainDate.from(start),
    title,
  })),
];

/** A phone's calendar: the toolbar with a view switcher over the view. */
function Phone({ anchor = "2026-10-08", view }: { readonly anchor?: string; readonly view: View }) {
  return (
    <TooltipProvider>
      <Calendar.Root
        defaultAnchorDate={Temporal.PlainDate.from(anchor)}
        defaultTimeZone="UTC"
        defaultView={view}
        events={events}
        locale="en-US"
        now={Temporal.Instant.from("2026-10-08T10:20:00Z")}
        onEventChange={() => {}}
        resources={resources}
        weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
      >
        <Calendar.Frame className="flex h-dvh flex-col">
          <CalendarToolbar calendar={Calendar} className="border-b">
            <ViewSwitcher
              onValueChange={() => {}}
              options={[{ label: "Resources", value: view }]}
              value={view}
            />
          </CalendarToolbar>
          <Calendar.Viewport className="min-h-0 flex-1">
            <Calendar.ActiveView />
          </Calendar.Viewport>
        </Calendar.Frame>
      </Calendar.Root>
    </TooltipProvider>
  );
}

// A resize handle sits inside its event, which is the target it belongs to. Annotation marks are
// targets too, but under 24 px on touch until #219, so the fixture has none.
const TARGETS =
  "a[href], button, input, select, [role='button'], [role='combobox'], [data-event-id], [data-slot='annotation-mark']";

/**
 * A timed event in a time grid, whose box is its time span: WCAG 2.5.8's "essential" exception,
 * which the axe gate makes too. A 15-minute event is 12 px tall.
 */
function spansTime(element: HTMLElement): boolean {
  return (
    element.hasAttribute("data-event-id") &&
    element.closest("[data-date]:not([data-all-day])") !== null &&
    element.closest(
      "[data-slot='time-grid'], [data-slot='scrolling-time-grid'], [data-slot='resource-columns']",
    ) !== null
  );
}

/**
 * The pointer targets in view that fail WCAG 2.5.8 (Target Size, Minimum): smaller than 24 × 24 px,
 * and not spaced as its exception allows. A 24 px circle centred on such a target may not reach
 * another target, or another small target's circle.
 */
function undersizedTargets(): string[] {
  const targets = [...document.querySelectorAll<HTMLElement>(TARGETS)]
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
  // A time span excuses an event's height, not its width.
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

// A phone's coarse pointer, which the month's taller lanes are for, needs Chromium's touch
// emulation through CDP; Firefox and WebKit can't emulate it here.
describe.runIf(server.browser === "chromium")("on a 375 px touch screen", () => {
  beforeAll(async () => {
    await page.viewport(375, 667);
    await cdp().send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  });
  // The page outlives this file: the next file in it gets a mouse again, and hover with it.
  afterAll(async () => {
    await cdp().send("Emulation.setTouchEmulationEnabled", { enabled: false });
  });

  // The week isn't here: seven columns at 375 px are 40 px wide, too narrow for its events. Phones
  // get the 3-day view instead.
  test.each<View>([
    "day",
    "3-day",
    "scrolling-3-day",
    "month",
    "scrolling-month",
    "year",
    "agenda",
    "resources",
    "timeline-day",
  ])("the %s view's targets are 24 px, or spaced as WCAG 2.5.8 allows", async (view) => {
    await render(<Phone view={view} />);
    await until(() =>
      expect(document.querySelector("[data-calendar-part='title']")).not.toBeNull(),
    );

    expect(undersizedTargets()).toEqual([]);
  });

  test("month events and +N more are 24 px tall", async () => {
    await render(<Phone view="month" />);
    const month = document.querySelector<HTMLElement>("[data-slot='month-view']")!;

    const more = month.querySelector<HTMLElement>("[data-slot='popover-trigger']")!;
    const event = month.querySelector<HTMLElement>("[data-event-id]")!;
    expect([more.offsetHeight, event.offsetHeight]).toEqual([24, 24]);
  });

  test("a week at its shortest still shows events beside +N more", async () => {
    // Weeks shrink to their 80 px minimum, which holds an event and +N more.
    await page.viewport(375, 480);
    try {
      await render(<Phone view="month" />);
      const week = document
        .querySelector("[data-slot='month-view'] [data-date='2026-10-08']")!
        .closest("[role='row']")!;

      await until(() => expect(week.querySelectorAll("[data-event-id]").length).toBeGreaterThan(0));
      expect(week.querySelector("[data-slot='popover-trigger']")).not.toBeNull();
    } finally {
      await page.viewport(375, 667);
    }
  });

  test("lanes grow when the pointer turns coarse, without a resize", async () => {
    // Weeks about 120 px tall: four 22 px lanes fit, but only three 26 px ones.
    await page.viewport(375, 700);
    try {
      await cdp().send("Emulation.setTouchEmulationEnabled", { enabled: false });
      await render(<Phone view="month" />);
      await cdp().send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });

      // Every event and +N more still ends inside its week, 24 px tall.
      await until(() => {
        for (const event of document.querySelectorAll<HTMLElement>(
          "[data-slot='month-view'] :is([data-event-id], [data-slot='popover-trigger'])",
        )) {
          const row = event.closest("[role='row']")!.getBoundingClientRect();
          expect([event.offsetHeight, event.getBoundingClientRect().bottom <= row.bottom]).toEqual([
            24,
            true,
          ]);
        }
      });
    } finally {
      await cdp().send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
      await page.viewport(375, 667);
    }
  });

  test("a week's title across two years wraps instead of being cut", async () => {
    await render(<Phone anchor="2026-12-30" view="week" />);
    const title = document.querySelector<HTMLElement>("[data-calendar-part='title']")!;

    expect(title.textContent).toMatch(/Dec 28, 2026 – Jan 3, 2027/u);
    expect(title.scrollHeight).toBeLessThanOrEqual(title.clientHeight);
    expect(title.scrollWidth).toBeLessThanOrEqual(title.clientWidth);
  });
});
