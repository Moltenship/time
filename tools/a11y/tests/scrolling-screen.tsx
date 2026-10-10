import {
  createCalendar,
  createCanonicalEventAdapter,
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
} from "@registry/scrolling-time-grid-view/scrolling-time-grid-view";

type Fixture = CalendarEvent<null, string>;

const Calendar = createCalendar<Fixture>()({
  eventAdapter: createCanonicalEventAdapter<null, string>(),
  views: [createScrollingWeekView(), createScrollingDayView(), createScrollingMonthView()],
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
  view,
}: {
  readonly dir?: "ltr" | "rtl";
  readonly view: ScrollingView;
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
  // One snap point per item: their spread gives the item length without one item's rounding.
  const points = [...viewport.querySelectorAll(".snap-start")].map((point) => {
    const { left, top } = point.getBoundingClientRect();
    return view === "scrolling-month" ? top : left;
  });
  const size = Math.abs(points.at(-1)! - points[0]!) / (points.length - 1);
  return {
    /** Items from the start of the canvas to the start of the view. */
    position: () =>
      (view === "scrolling-month" ? viewport.scrollTop : Math.abs(viewport.scrollLeft)) / size,
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
