// @vitest-environment jsdom

import {
  createCalendar,
  defineCalendarView,
  defineEventAdapter,
  plainDateInterval,
} from "@moltenship/calendar-solid";
import { expect, test } from "vite-plus/test";

import { CalendarToolbar } from "../calendar/calendar-toolbar";
import { clock } from "./view-fixtures";
import { click, render } from "./render";

interface Meeting {
  readonly end: Temporal.Instant;
  readonly id: `meeting-${number}`;
  readonly start: Temporal.Instant;
}

const dayView = defineCalendarView({
  name: "day",
  strategy: {
    getRange: (anchor) => plainDateInterval(anchor, anchor.add({ days: 1 })),
    getTitle: (range) => range.start.toString(),
    navigate: (anchor, delta) => anchor.add({ days: delta }),
    project: () => null,
  },
  Renderer: () => null,
});

const Calendar = createCalendar<Meeting, never>()({
  eventAdapter: defineEventAdapter<Meeting>()({
    getId: (meeting) => meeting.id,
    getInterval: (meeting) => ({ end: meeting.end, kind: "timed", start: meeting.start }),
    getResourceIds: () => [],
    getTitle: (meeting) => meeting.id,
  }),
  views: [dayView],
});

test("styles the factory's headless triggers and title", async () => {
  const { container } = await render(() => (
    <Calendar.Root
      clock={clock}
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-01")}
      defaultTimeZone="UTC"
      events={[]}
      locale="en-US"
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <CalendarToolbar calendar={Calendar}>
        <span>actions</span>
      </CalendarToolbar>
    </Calendar.Root>
  ));
  const title = () => container.querySelector('[data-calendar-part="title"]')?.textContent;

  expect(title()).toBe("2026-10-01");
  expect(container.textContent).toContain("actions");

  await click(container.querySelector('button[aria-label="Next period"]'));
  expect(title()).toBe("2026-10-02");

  await click(container.querySelector('button[aria-label="Previous period"]'));
  await click(container.querySelector('button[aria-label="Previous period"]'));
  expect(title()).toBe("2026-09-30");

  await click(container.querySelector('[data-calendar-part="today-trigger"]'));
  expect(title()).toBe("2026-10-08");
});
