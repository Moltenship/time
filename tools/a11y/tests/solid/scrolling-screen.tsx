import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEvent,
  type CalendarEventChange,
  type CalendarVisibleRange,
} from "@moltenship/calendar-solid";
import { expect } from "vite-plus/test";

import { calendarAnnouncements } from "@registry/shared/calendar/announcements";
import { CalendarToolbar } from "@registry/calendar/calendar-toolbar";
import {
  createScrollingDayView,
  createScrollingThreeDayView,
  createScrollingWeekView,
} from "@registry/scrolling-time-grid-view/scrolling-time-grid-view";

import { settled } from "./render";

// The Solid scrolling week, 3-day and day under the toolbar, as React's `scrolling-screen.tsx`
// renders them: the same events, clock and anchor, so the Solid files check what React's check.

type Fixture = CalendarEvent<null, string>;

const Calendar = createCalendar<Fixture>()({
  eventAdapter: createCanonicalEventAdapter<null, string>(),
  views: [
    createScrollingWeekView({ dayView: "scrolling-day" }),
    createScrollingThreeDayView({ dayView: "scrolling-day" }),
    createScrollingDayView(),
  ],
});
export type ScrollingView = (typeof Calendar.views)[number]["name"];

const anchor = Temporal.PlainDate.from("2026-10-07");
const events: readonly Fixture[] = [
  {
    data: null,
    end: Temporal.Instant.from("2026-10-08T11:00:00Z"),
    id: "planning",
    kind: "timed",
    start: Temporal.Instant.from("2026-10-08T09:00:00Z"),
    title: "Planning",
  },
  {
    data: null,
    end: Temporal.PlainDate.from("2026-10-16"),
    id: "trip",
    kind: "all-day",
    start: Temporal.PlainDate.from("2026-10-12"),
    title: "Trip",
  },
];

/** The calendar's actions, for tests that move it as an app would. */
export const screen: { actions?: ReturnType<typeof Calendar.useCalendarActions> } = {};

function CaptureActions() {
  screen.actions = Calendar.useCalendarActions();
  return null;
}

/** What the calendar reported, in order; clear it between tests. */
export const reported = {
  anchors: [] as Temporal.PlainDate[],
  changes: [] as CalendarEventChange<Fixture, string, string>[],
  ranges: [] as CalendarVisibleRange<ScrollingView>[],
};

export function clearReported() {
  reported.anchors = [];
  reported.changes = [];
  reported.ranges = [];
  screen.actions = undefined;
}

/** A scrolling view under the toolbar, from Wednesday October 7, 2026, with Monday-first weeks. */
export function ScrollingScreen(props: {
  readonly dir?: "ltr" | "rtl";
  /** A controlled anchor the app never moves, declining every scroll. */
  readonly heldAnchor?: Temporal.PlainDate;
  readonly view: ScrollingView;
}) {
  const dir = () => props.dir ?? "ltr";
  return (
    <Calendar.Root
      {...(props.heldAnchor === undefined
        ? { defaultAnchorDate: anchor }
        : { anchorDate: props.heldAnchor })}
      defaultTimeZone="UTC"
      defaultView={props.view}
      direction={dir()}
      events={events}
      locale="en-US"
      now={Temporal.Instant.from("2026-10-08T10:20:00Z")}
      onAnchorDateChange={(date) => reported.anchors.push(date)}
      onEventChange={(change) => {
        reported.changes.push(change);
      }}
      onVisibleRangeChange={(range) => reported.ranges.push(range)}
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <CaptureActions />
      <Calendar.Frame class="flex h-dvh flex-col" dir={dir()}>
        <CalendarToolbar calendar={Calendar} class="border-b" />
        <Calendar.Viewport class="min-h-0 flex-1">
          <Calendar.ActiveView />
        </Calendar.Viewport>
      </Calendar.Frame>
      <Calendar.Announcer messages={calendarAnnouncements} />
    </Calendar.Root>
  );
}

export const title = () => document.querySelector('[data-calendar-part="title"]')?.textContent;

export const spoken = () =>
  document
    .querySelector('[data-calendar-part="announcer"]')
    ?.textContent?.replace(/\s/g, " ")
    .trim();

/** Clicks a toolbar button by its name, and settles what it set off. */
export async function toolbar(name: "Next period" | "Previous period" | "Today") {
  document.querySelector<HTMLElement>(`[aria-label="${name}"]`)!.click();
  await settled();
}

/**
 * The element that scrolls the days, one day's width, and the element around it that scrolls
 * the hours, as React's `axis` measures them.
 */
export function axis() {
  const scroller = document.querySelector<HTMLElement>('[data-slot="scrolling-time-grid-days"]')!;
  const hours = document.querySelector<HTMLElement>('[data-slot="scrolling-time-grid-viewport"]')!;
  // The spread of the snap points, a page of visible days apart, gives one day's width without
  // the rounding of any one of them.
  const points = [...scroller.querySelectorAll(".snap-start")].map(
    (point) => point.getBoundingClientRect().left,
  );
  const apart = scroller.querySelectorAll('[role="gridcell"][data-date]:not([aria-hidden])').length;
  const size = Math.abs(points.at(-1)! - points[0]!) / (points.length - 1) / apart;
  const sign = (dir: "ltr" | "rtl") => (dir === "rtl" ? -1 : 1);
  return {
    /** Days from a fixed start to the start of the view; compare positions, not their values. */
    position: () => Math.abs(scroller.scrollLeft) / size,
    /**
     * Moves the view `days` on toward later dates and leaves it there, as a drag let go there
     * does: the browser snaps to the nearest page, where a step such as `scrollBy` snaps on.
     */
    dragBy: async (days: number, dir: "ltr" | "rtl" = "ltr") => {
      scroller.scrollTo({
        behavior: "instant",
        left: scroller.scrollLeft + days * size * sign(dir),
      });
      await settled();
    },
    /** Scrolls by `days` toward later dates, as a wheel's step does. */
    scrollBy: async (days: number, dir: "ltr" | "rtl" = "ltr") => {
      scroller.scrollBy({ behavior: "instant", left: days * size * sign(dir) });
      await settled();
    },
    hours,
    scroller,
  };
}

export const near = (value: number, expected: number, within = 0.1) =>
  expect(Math.abs(value - expected)).toBeLessThan(within);

/** Each day header's offset from its day's column: none while they line up. */
export function headerDrift() {
  const header = document.querySelector('[data-slot="scrolling-time-grid-header"]')!;
  // The first column header names the gutter.
  const headers = [...header.querySelectorAll('[role="columnheader"]')].slice(1);
  const columns = [
    ...document.querySelectorAll('[data-slot="scrolling-time-grid-days"] [role="gridcell"]'),
  ];
  expect(headers).toHaveLength(columns.length);
  return Math.max(
    ...headers.map((cell, index) =>
      Math.abs(cell.getBoundingClientRect().left - columns[index]!.getBoundingClientRect().left),
    ),
  );
}

/** A mouse pointer event's init at a point, with its own id. */
export const pointerAt = (x: number, y: number, pointerId = 1): PointerEventInit => ({
  bubbles: true,
  button: 0,
  clientX: x,
  clientY: y,
  isPrimary: true,
  pointerId,
  pointerType: "mouse",
});
