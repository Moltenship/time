// @vitest-environment jsdom

import {
  createCalendar,
  createFixedClock,
  defineCalendarView,
  defineEventAdapter,
  plainDateInterval,
} from "@moltenship/calendar";
import { afterEach, expect, test } from "vite-plus/test";

import { CalendarToolbar } from "../calendar/calendar-toolbar";
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
const clock = createFixedClock(Temporal.Instant.from("2026-10-08T12:00:00Z"));
let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

test("styles the factory's headless triggers and title", async () => {
  const { container, unmount } = await render(
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
    </Calendar.Root>,
  );
  cleanup = unmount;
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
