import { createCalendar, createCanonicalEventAdapter } from "@moltenship/calendar";
import { describe, expect, test } from "vite-plus/test";
import { server } from "vite-plus/test/browser";

import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import { createScrollingAgendaView } from "@registry/scrolling-list-view/scrolling-agenda-view";
import { createScrollingMonthView } from "@registry/scrolling-month-view/scrolling-month-view";

import { describeTree } from "./kit-twins";
import {
  monthAnchor,
  monthAvailability,
  monthEvents,
  monthNow,
  monthWeekRules,
  type MonthFixture,
} from "./month-fixture";
import { atRest, render, until } from "./render";

// React's scrolling month and agenda render what `view-twins/` stores, and
// `solid/scrolling-month.a11y.tsx` and `solid/scrolling-agenda.a11y.tsx` check the Solid views
// render the same (ADR 0279). React's run writes the files, with `-u` on a change.

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
});
