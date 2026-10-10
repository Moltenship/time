import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEvent,
  type CalendarResource,
} from "@moltenship/calendar";
import { describe, expect, test } from "vite-plus/test";

import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import {
  createTimelineDayView,
  createTimelineMonthView,
  createTimelineWeekView,
} from "@registry/resource-timeline-view/resource-timeline-view";

import { seriousViolations, setTheme, themes } from "./axe";
import { render } from "./render";

type Booking = CalendarEvent<{ readonly color: CalendarEventColor }, string, string>;

/** Ten sites of four rooms, the second site collapsed. */
const resources: readonly CalendarResource<null>[] = Array.from({ length: 10 }, (_, site) => [
  { data: null, id: `site-${site}`, title: `Site ${site + 1}` },
  ...Array.from({ length: 4 }, (_, room) => ({
    data: null,
    id: `site-${site}-room-${room}`,
    parentId: `site-${site}`,
    title: `Room ${site + 1}.${room + 1}`,
  })),
]).flat();

function booking(
  color: CalendarEventColor,
  title: string,
  resourceIds: readonly string[],
  start: string,
  hours: number,
): Booking {
  const from = Temporal.Instant.from(start);
  return {
    data: { color },
    end: from.add({ minutes: hours * 60 }),
    id: title,
    kind: "timed",
    resourceIds,
    start: from,
    title,
  };
}

const events: readonly Booking[] = [
  booking("blue", "Standup", ["site-0-room-0"], "2026-10-06T09:00:00Z", 1),
  booking("green", "Review", ["site-0-room-0", "site-0-room-2"], "2026-10-06T13:00:00Z", 2),
  booking("purple", "Workshop", ["site-0-room-1"], "2026-10-07T09:00:00Z", 30),
  booking("orange", "Audit", ["site-2-room-3"], "2026-10-08T10:00:00Z", 1),
  booking("pink", "Check-in", ["site-0-room-3"], "2026-10-08T08:00:00Z", 0.25),
  booking("teal", "Lunch", [], "2026-10-09T12:00:00Z", 1),
];

const getEventColor = (event: Booking) => event.data.color;
const Calendar = createCalendar<Booking, CalendarResource<null>>()({
  eventAdapter: createCanonicalEventAdapter<
    { readonly color: CalendarEventColor },
    string,
    string
  >(),
  views: [
    createTimelineWeekView<Booking>({ getEventColor, unassigned: "bucket" }),
    createTimelineMonthView<Booking>({ getEventColor }),
    createTimelineDayView<Booking>({ getEventColor }),
  ],
});

function Timeline({
  direction = "ltr",
  view,
}: {
  readonly direction?: "ltr" | "rtl";
  readonly view: "timeline-day" | "timeline-month" | "timeline-week";
}) {
  return (
    <Calendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultExpandedResourceIds={resources
        .filter(({ id, parentId }) => parentId === undefined && id !== "site-1")
        .map(({ id }) => id)}
      defaultTimeZone="UTC"
      defaultView={view}
      direction={direction}
      events={events}
      locale="en-US"
      now={Temporal.Instant.from("2026-10-08T10:20:00Z")}
      resources={resources}
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <Calendar.Frame className="h-[600px] w-[1000px]" dir={direction}>
        <Calendar.ActiveView />
      </Calendar.Frame>
    </Calendar.Root>
  );
}

describe.each(themes)("resource timeline, %s theme", (theme) => {
  test.each(["timeline-day", "timeline-week", "timeline-month"] as const)("%s", async (view) => {
    setTheme(theme);
    await render(<Timeline view={view} />);

    expect(document.querySelectorAll("[data-event-id]").length).toBeGreaterThan(0);
    expect(await seriousViolations()).toEqual([]);
  });
});

test("RTL: days run from the right, behind a resource column that stays there", async () => {
  await render(<Timeline direction="rtl" view="timeline-month" />);
  const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
  const fullDate = new Intl.DateTimeFormat("en-US", { dateStyle: "full" });
  const day = (date: number) =>
    box(
      `[role="columnheader"][aria-label="${fullDate.format(new Temporal.PlainDate(2026, 10, date))}"]`,
    );
  const grid = box('[role="grid"]');
  const viewport = document.querySelector<HTMLElement>('[data-slot="resource-timeline-viewport"]')!;

  expect(box('[role="rowheader"]').right).toBe(grid.right);
  expect(day(2).right).toBe(day(1).left);
  // A bar starts 2px past its day's 1px grid line, and its accent border is on the right.
  const standup = document.querySelector<HTMLElement>('[data-event-id="Standup"]')!;
  expect(Math.round(day(6).right - standup.getBoundingClientRect().right)).toBe(3);
  expect(getComputedStyle(standup).borderRightWidth).toBe("3px");

  viewport.scrollLeft = -300;
  await new Promise((resolve) => requestAnimationFrame(resolve));

  expect(box('[role="rowheader"]').right).toBe(grid.right);
  expect(day(1).right).toBe(grid.right - 208 + 300);
});
