// @vitest-environment jsdom

import {
  createCalendar,
  createFixedClock,
  defineCalendarView,
  defineEventAdapter,
  plainDateInterval,
} from "@moltenship/calendar";
import { createAgent } from "@ui-sdk/react/agent";
import { act } from "react";
import { afterEach, expect, test } from "vite-plus/test";

import { CalendarToolbar } from "../calendar/calendar-toolbar";
import { ViewSwitcher } from "../calendar/view-switcher";
import { render } from "./render";

// One bridge for the file: it hears components as they are made, so it exists before any renders.
const agent = createAgent();

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

test("an agent's snapshot of the toolbar finds the kit's buttons and its view select, named once", async () => {
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
        <ViewSwitcher
          options={[
            { label: "Day", shortcut: "D", value: "day" },
            { label: "Week", shortcut: "W", value: "week" },
          ]}
          value="day"
          onValueChange={() => undefined}
        />
      </CalendarToolbar>
    </Calendar.Root>,
  );
  cleanup = unmount;

  const found = agent.snapshot().filter((component) => component.offPage !== true);
  const buttons = found.filter((component) => component.component === "button");
  expect(buttons.map((button) => button.label)).toEqual([
    "Today",
    "Previous period",
    "Next period",
  ]);
  expect(found.find((component) => component.component === "select")).toMatchObject({
    items: [
      { label: "Day", value: "day" },
      { label: "Week", value: "week" },
    ],
    label: "View",
    value: "day",
  });

  // The step buttons' tooltips name them and add no description, which would repeat the name on
  // every focus. Base UI's tooltip before the kit did the same.
  for (const label of ["Previous period", "Next period"]) {
    const button = container.querySelector(`button[aria-label="${label}"]`);
    expect(button?.hasAttribute("aria-describedby"), label).toBe(false);
    const name = container.ownerDocument.getElementById(
      button?.getAttribute("aria-labelledby") ?? "",
    );
    expect(name?.textContent, label).toBe(label);
  }

  // The kit's button wraps the calendar's trigger, so pressing it moves the calendar.
  await act(async () => {
    await agent.act({ steps: [{ action: "press", ref: "Next period" }] });
  });
  expect(container.querySelector('[data-calendar-part="title"]')?.textContent).toBe("2026-10-02");
});
