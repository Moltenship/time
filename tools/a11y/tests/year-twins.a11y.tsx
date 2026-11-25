import { createCalendar, createCanonicalEventAdapter } from "@moltenship/calendar";
import { describe, expect, test } from "vite-plus/test";
import { server } from "vite-plus/test/browser";

import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import { createYearView } from "@registry/year-view/year-view";

import { opened } from "./kit-twins";
import { click, render, until } from "./render";
import {
  describeYear,
  yearAnchor,
  yearAvailability,
  yearEvents,
  yearNow,
  yearWeekRules,
  type YearFixture,
} from "./year-fixture";

// React's year renders what `view-twins/` stores, and `solid/year.a11y.tsx` checks the Solid year
// renders the same (ADR 0279): roles, names, classes and keys, with its day popover closed and
// open. React's run writes the files, with `-u` on a change.

const Calendar = createCalendar<YearFixture>()({
  eventAdapter: createCanonicalEventAdapter<{ readonly color: CalendarEventColor }, string>(),
  views: [createYearView<YearFixture>({ getEventColor: (event) => event.data.color })],
});

const year = () => document.querySelector('[data-slot="year-view"]')!;
const popover = () => document.querySelector('[data-slot="popover-content"]');

// The descriptions are Chromium's: another engine serializes some attributes its own way.
describe.runIf(server.browser === "chromium")("year twins", () => {
  test("the year, and a day's popover open", async () => {
    await render(
      <Calendar.Root
        availability={yearAvailability}
        defaultAnchorDate={yearAnchor}
        defaultTimeZone="UTC"
        defaultView="year"
        events={yearEvents}
        locale="en-US"
        now={yearNow}
        weekRules={yearWeekRules}
      >
        <Calendar.Frame className="flex h-dvh flex-col">
          <Calendar.Viewport className="min-h-0 flex-1">
            <Calendar.ActiveView />
          </Calendar.Viewport>
        </Calendar.Frame>
      </Calendar.Root>,
    );
    await expect(describeYear(year())).toMatchFileSnapshot("./view-twins/year.txt");

    await click(year().querySelector<HTMLElement>('[data-date="2026-10-08"] button'));
    await until(() => expect(opened(popover())).toBe(true));
    await expect(describeYear(year(), popover()!)).toMatchFileSnapshot(
      "./view-twins/year-popover.txt",
    );
  });
});
