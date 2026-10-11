import {
  createCalendar,
  createCanonicalEventAdapter,
  defineCalendarView,
  scrollingTimeGridStrategy,
  type CalendarEvent,
  type CalendarEventChange,
  type CalendarVisibleRange,
} from "@moltenship/calendar";
import { act } from "react";

import { CalendarToolbar } from "@registry/calendar/calendar-toolbar";
import { createScrollingMonthView } from "@registry/scrolling-month-view/scrolling-month-view";
import {
  createScrollingDayView,
  createScrollingWeekView,
  ScrollingTimeGridView,
} from "@registry/scrolling-time-grid-view/scrolling-time-grid-view";
import type { TimeGridViewOptions } from "@registry/time-grid-view/time-grid-view";

type Fixture = CalendarEvent<null, string>;

const Calendar = createCalendar<Fixture>()({
  eventAdapter: createCanonicalEventAdapter<null, string>(),
  views: [
    createScrollingWeekView(),
    defineCalendarView({
      defaultOptions: {},
      name: "scrolling-3-day",
      strategy: scrollingTimeGridStrategy<TimeGridViewOptions<Fixture>, Fixture>({
        count: 3,
        kind: "days",
      }),
      Renderer: ScrollingTimeGridView<Fixture>,
    }),
    createScrollingDayView(),
    createScrollingMonthView(),
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

/** A scrolling view under the toolbar, from Wednesday October 7, 2026, with Monday-first weeks. */
export function ScrollingScreen({
  dir = "ltr",
  heldAnchor,
  view,
}: {
  readonly dir?: "ltr" | "rtl";
  /** A controlled anchor the app never moves, declining every scroll. */
  readonly heldAnchor?: Temporal.PlainDate;
  readonly view: ScrollingView;
}) {
  return (
    <Calendar.Root
      {...(heldAnchor === undefined ? { defaultAnchorDate: anchor } : { anchorDate: heldAnchor })}
      defaultTimeZone="UTC"
      defaultView={view}
      direction={dir}
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
      <Calendar.Frame className="flex h-dvh flex-col" dir={dir}>
        <CalendarToolbar calendar={Calendar} className="border-b" />
        <Calendar.Viewport className="min-h-0 flex-1">
          <Calendar.ActiveView />
        </Calendar.Viewport>
      </Calendar.Frame>
    </Calendar.Root>
  );
}

export const title = () => document.querySelector('[data-calendar-part="title"]')?.textContent;

/** The scrolling element and one item's length along its axis. */
export function axis(view: ScrollingView) {
  const viewport = document.querySelector<HTMLElement>(
    view === "scrolling-month"
      ? '[data-slot="scrolling-month-viewport"]'
      : '[data-slot="scrolling-time-grid-viewport"]',
  )!;
  // The spread of the snap points, a page of visible days apart, or of the week rows, gives one
  // item's length without the rounding of any one of them.
  const points = [
    ...viewport.querySelectorAll(view === "scrolling-month" ? '[role="row"]' : ".snap-start"),
  ].map((point) => {
    const { left, top } = point.getBoundingClientRect();
    return view === "scrolling-month" ? top : left;
  });
  const apart =
    view === "scrolling-month"
      ? 1
      : viewport.querySelectorAll('[role="gridcell"][data-date]:not([aria-hidden])').length;
  const size = Math.abs(points.at(-1)! - points[0]!) / (points.length - 1) / apart;
  /**
   * Weeks from 1970 to the top of the view, by the week row there: its rounding stays within the
   * row, where a row length rounded to layout units would add up across a thousand weeks.
   */
  const monthPosition = () => {
    const { top } = viewport.getBoundingClientRect();
    const row = [...viewport.querySelectorAll('[role="row"]')].find(
      (candidate) => candidate.getBoundingClientRect().bottom > top + 0.5,
    )!;
    const bounds = row.getBoundingClientRect();
    const date = Temporal.PlainDate.from(
      row.querySelector("[data-date]")!.getAttribute("data-date")!,
    );
    const week = Math.floor(Temporal.PlainDate.from("1970-01-01").until(date).days / 7);
    return week + (top - bounds.top) / bounds.height;
  };
  return {
    /** Items from a fixed start to the start of the view; compare positions, not their values. */
    position: () =>
      view === "scrolling-month" ? monthPosition() : Math.abs(viewport.scrollLeft) / size,
    /**
     * Moves the view `items` on toward later dates and leaves it there, as a drag let go there
     * does: the browser snaps to the nearest page, where a step such as `scrollBy` or a wheel
     * tick snaps on to the next.
     */
    dragBy: (items: number, dir: "ltr" | "rtl" = "ltr") =>
      act(async () =>
        viewport.scrollTo(
          view === "scrolling-month"
            ? { behavior: "instant", top: viewport.scrollTop + items * size }
            : {
                behavior: "instant",
                left: viewport.scrollLeft + items * size * (dir === "rtl" ? -1 : 1),
              },
        ),
      ),
    /** Scrolls by `items` along the axis, toward later dates. */
    scrollBy: (items: number, dir: "ltr" | "rtl" = "ltr") =>
      act(async () =>
        viewport.scrollBy(
          view === "scrolling-month"
            ? { behavior: "instant", top: items * size }
            : { behavior: "instant", left: items * size * (dir === "rtl" ? -1 : 1) },
        ),
      ),
    viewport,
  };
}
