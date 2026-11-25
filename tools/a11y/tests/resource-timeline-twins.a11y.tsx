import { createCalendar, createCanonicalEventAdapter } from "@moltenship/calendar";
import { describe, expect, test } from "vite-plus/test";
import { server } from "vite-plus/test/browser";

import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import {
  createTimelineDayView,
  createTimelineWeekView,
} from "@registry/resource-timeline-view/resource-timeline-view";

import { describeLayout } from "./kit-twins";
import { atRest, click, render, until } from "./render";
import {
  timelineAnchor,
  timelineAvailability,
  timelineBookings,
  timelineExpanded,
  timelineNow,
  timelineResources,
  timelineWeekRules,
  type TimelineBooking,
  type TimelineResource,
} from "./timeline-fixture";

// React's resource timeline renders what `view-twins/` stores, and `solid/resource-timeline.a11y.tsx`
// checks the Solid timeline renders the same (ADR 0279): roles, names, classes, keys and what an
// agent reads. React's run writes the files, with `-u` on a change.

const getEventColor = (event: TimelineBooking) => event.data.color;
const Calendar = createCalendar<TimelineBooking, TimelineResource>()({
  eventAdapter: createCanonicalEventAdapter<
    { readonly color: CalendarEventColor },
    string,
    string
  >(),
  views: [
    createTimelineDayView<TimelineBooking>({ getEventColor, resourceStatus: true }),
    createTimelineWeekView<TimelineBooking>({ getEventColor, unassigned: "bucket" }),
  ],
});

const grid = () => document.querySelector<HTMLElement>('[data-slot="resource-timeline"]')!;
const viewport = () =>
  document.querySelector<HTMLElement>('[data-slot="resource-timeline-viewport"]')!;

function Timeline({ view }: { readonly view: "timeline-day" | "timeline-week" }) {
  return (
    <Calendar.Root
      availability={timelineAvailability}
      defaultAnchorDate={timelineAnchor}
      defaultExpandedResourceIds={timelineExpanded}
      defaultTimeZone="UTC"
      defaultView={view}
      events={timelineBookings}
      locale="en-US"
      now={timelineNow}
      onEventChange={() => {}}
      resources={timelineResources}
      weekRules={timelineWeekRules}
    >
      <Calendar.Frame className="h-[600px] w-[1000px]">
        <Calendar.ActiveView />
      </Calendar.Frame>
    </Calendar.Root>
  );
}

// The descriptions are Chromium's: another engine serializes some attributes its own way.
describe.runIf(server.browser === "chromium")("resource timeline twins", () => {
  test("a day of hours, opened on now, with each resource's status", async () => {
    await render(<Timeline view="timeline-day" />);
    await until(() =>
      expect(grid().querySelector('[data-slot="resource-timeline-now"]')).not.toBeNull(),
    );
    await until(() => expect(viewport().scrollLeft).toBeGreaterThan(0));
    await atRest(viewport());
    await expect(describeLayout(grid())).toMatchFileSnapshot("./view-twins/timeline-day.txt");
  });

  test("a week of days, and a site collapsed from its toggle", async () => {
    await render(<Timeline view="timeline-week" />);
    await until(() => expect(grid().querySelector('[data-event-id="Workshop"]')).not.toBeNull());
    await atRest(viewport());
    await expect(describeLayout(grid())).toMatchFileSnapshot("./view-twins/timeline-week.txt");

    await click(grid().querySelector<HTMLElement>('[aria-label="Collapse Site 1"]'));
    await until(() => expect(grid().querySelector('[aria-label="Expand Site 1"]')).not.toBeNull());
    await atRest(viewport());
    await expect(describeLayout(grid())).toMatchFileSnapshot(
      "./view-twins/timeline-week-collapsed.txt",
    );
  });
});
