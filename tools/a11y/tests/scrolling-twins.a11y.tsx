import { createCalendar, createCanonicalEventAdapter } from "@moltenship/calendar";
import { describe, expect, test } from "vite-plus/test";
import { server } from "vite-plus/test/browser";

import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import { createScrollingAgendaView } from "@registry/scrolling-list-view/scrolling-agenda-view";
import { createScrollingMonthView } from "@registry/scrolling-month-view/scrolling-month-view";
import {
  createScrollingDayView,
  createScrollingWeekView,
} from "@registry/scrolling-time-grid-view/scrolling-time-grid-view";

import { describeScrollingLayout, describeTree } from "./kit-twins";
import {
  monthAnchor,
  monthAvailability,
  monthEvents,
  monthNow,
  monthWeekRules,
  type MonthFixture,
} from "./month-fixture";
import { atRest, render, until } from "./render";
import {
  timeGridAnchor,
  timeGridEvents,
  timeGridNow,
  timeGridWeekRules,
  type TimeGridFixture,
} from "./time-grid-fixture";

// React's scrolling month, agenda, week and day render what `view-twins/` stores, and
// `solid/scrolling-month.a11y.tsx`, `solid/scrolling-agenda.a11y.tsx` and
// `solid/scrolling-time-grid.a11y.tsx` check the Solid views render the same (ADR 0279). React's
// run writes the files, with `-u` on a change.

const Calendar = createCalendar<MonthFixture>()({
  eventAdapter: createCanonicalEventAdapter<{ readonly color: CalendarEventColor }, string>(),
  views: [
    createScrollingMonthView<MonthFixture>({ getEventColor: (event) => event.data.color }),
    createScrollingAgendaView<MonthFixture>({ getEventColor: (event) => event.data.color }),
  ],
});

function Screen({ view }: { readonly view: "scrolling-agenda" | "scrolling-month" }) {
  return (
    <Calendar.Root
      availability={monthAvailability}
      defaultAnchorDate={monthAnchor}
      defaultTimeZone="UTC"
      defaultView={view}
      events={monthEvents}
      locale="en-US"
      now={monthNow}
      onEventChange={() => {}}
      weekRules={monthWeekRules}
    >
      <Calendar.Frame className="flex h-dvh flex-col">
        <Calendar.Viewport className="min-h-0 flex-1">
          <Calendar.ActiveView />
        </Calendar.Viewport>
      </Calendar.Frame>
    </Calendar.Root>
  );
}

const TimeGridCalendar = createCalendar<TimeGridFixture>()({
  eventAdapter: createCanonicalEventAdapter<{ readonly color: CalendarEventColor }, string>(),
  views: [
    createScrollingWeekView<TimeGridFixture>({
      dayView: "scrolling-day",
      getEventColor: (event) => event.data.color,
    }),
    createScrollingDayView<TimeGridFixture>({ getEventColor: (event) => event.data.color }),
  ],
});

function TimeGridScreen({ view }: { readonly view: "scrolling-day" | "scrolling-week" }) {
  return (
    <TimeGridCalendar.Root
      defaultAnchorDate={timeGridAnchor}
      defaultTimeZone="UTC"
      defaultView={view}
      events={timeGridEvents}
      locale="en-US"
      now={timeGridNow}
      onEventChange={() => {}}
      weekRules={timeGridWeekRules}
    >
      <TimeGridCalendar.Frame className="flex h-dvh flex-col">
        <TimeGridCalendar.Viewport className="min-h-0 flex-1">
          <TimeGridCalendar.ActiveView />
        </TimeGridCalendar.Viewport>
      </TimeGridCalendar.Frame>
    </TimeGridCalendar.Root>
  );
}

// The descriptions are Chromium's: another engine serializes some attributes its own way.
describe.runIf(server.browser === "chromium")("scrolling twins", () => {
  test("the scrolling month", async () => {
    await render(<Screen view="scrolling-month" />);
    const month = () => document.querySelector('[data-slot="scrolling-month"]')!;
    await until(() =>
      expect(month().querySelector('[aria-label*=" more events on "]')).not.toBeNull(),
    );
    await atRest(document.querySelector<HTMLElement>('[data-slot="scrolling-month-viewport"]')!);
    await expect(describeTree(month())).toMatchFileSnapshot("./view-twins/scrolling-month.txt");
  });

  test("the scrolling agenda", async () => {
    await render(<Screen view="scrolling-agenda" />);
    const agenda = () => document.querySelector<HTMLElement>('[data-slot="agenda-view"]')!;
    await until(() => expect(agenda().querySelector("[data-event-id]")).not.toBeNull());
    await atRest(agenda());
    await expect(describeTree(agenda())).toMatchFileSnapshot("./view-twins/scrolling-agenda.txt");
  });

  test.each(["scrolling-week", "scrolling-day"] as const)("the %s view", async (view) => {
    await render(<TimeGridScreen view={view} />);
    const grid = () => document.querySelector('[data-slot="scrolling-time-grid"]')!;
    await until(() => expect(grid().querySelector('[data-slot="time-grid-now"]')).not.toBeNull());
    await atRest(document.querySelector<HTMLElement>('[data-slot="scrolling-time-grid-days"]')!);
    await expect(describeScrollingLayout(grid())).toMatchFileSnapshot(`./view-twins/${view}.txt`);
  });
});
