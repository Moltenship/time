import { createCalendar, createCanonicalEventAdapter } from "@moltenship/calendar";
import { describe, expect, test } from "vite-plus/test";
import { server } from "vite-plus/test/browser";

import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import { createMonthView } from "@registry/month-view/month-view";

import { describeTree, opened } from "./kit-twins";
import {
  monthAnchor,
  monthAvailability,
  monthEvents,
  monthNow,
  monthWeekRules,
  type MonthFixture,
} from "./month-fixture";
import { click, render, until } from "./render";

// React's month renders what `view-twins/` stores, and `solid/month.a11y.tsx` checks the Solid
// month renders the same (ADR 0279): roles, names, classes, keys and what an agent reads. React's
// run writes the files, with `-u` on a change.

const Calendar = createCalendar<MonthFixture>()({
  eventAdapter: createCanonicalEventAdapter<{ readonly color: CalendarEventColor }, string>(),
  views: [createMonthView<MonthFixture>({ getEventColor: (event) => event.data.color })],
});

const month = () => document.querySelector('[data-slot="month-view"]')!;

// The descriptions are Chromium's: another engine serializes some attributes its own way.
describe.runIf(server.browser === "chromium")("month twins", () => {
  test("the month, and its +N more list open", async () => {
    await render(
      <Calendar.Root
        availability={monthAvailability}
        defaultAnchorDate={monthAnchor}
        defaultTimeZone="UTC"
        defaultView="month"
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
      </Calendar.Root>,
    );
    await until(() =>
      expect(month().querySelector('[aria-label*=" more events on "]')).not.toBeNull(),
    );
    await expect(describeTree(month())).toMatchFileSnapshot("./view-twins/month.txt");

    await click(month().querySelector<HTMLElement>('[aria-label*=" more events on Thursday"]'));
    await until(() =>
      expect(opened(document.querySelector('[data-slot="popover-content"]'))).toBe(true),
    );
    // The list opens in the top layer from inside its cell.
    await expect(describeTree(month())).toMatchFileSnapshot("./view-twins/month-more.txt");
  });
});
