// @vitest-environment jsdom

import {
  createCalendar,
  defineCalendarView,
  defineEventAdapter,
  plainDateInterval,
} from "@moltenship/calendar-solid";
import { createAgent } from "@ui-sdk/solid/agent";
import { expect, test } from "vite-plus/test";

import { CalendarToolbar } from "../calendar/calendar-toolbar";
import { ViewSwitcher } from "../calendar/view-switcher";
import { render, settled } from "./render";
import { clock } from "./view-fixtures";

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

test("an agent's snapshot of the toolbar finds the kit's buttons and its view select, named once", async () => {
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
        <ViewSwitcher
          options={[
            { label: "Day", shortcut: "D", value: "day" },
            { label: "Week", shortcut: "W", value: "week" },
          ]}
          value="day"
          onValueChange={() => undefined}
        />
      </CalendarToolbar>
    </Calendar.Root>
  ));

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
  // every focus, as in React.
  for (const label of ["Previous period", "Next period"]) {
    const button = container.querySelector(`button[aria-label="${label}"]`);
    expect(button?.hasAttribute("aria-describedby"), label).toBe(false);
    const name = container.ownerDocument.getElementById(
      button?.getAttribute("aria-labelledby") ?? "",
    );
    expect(name?.textContent, label).toBe(label);
  }

  // The kit's button wraps the calendar's trigger, so pressing it moves the calendar.
  await agent.act({ steps: [{ action: "press", ref: "Next period" }] });
  await settled();
  expect(container.querySelector('[data-calendar-part="title"]')?.textContent).toBe("2026-10-02");
});
