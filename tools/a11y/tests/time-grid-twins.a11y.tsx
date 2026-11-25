import { createCalendar, createCanonicalEventAdapter } from "@moltenship/calendar";
import { describe, expect, test } from "vite-plus/test";
import { server, userEvent } from "vite-plus/test/browser";

import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import { createDayView, createWeekView } from "@registry/time-grid-view/time-grid-view";

import { describeLayout } from "./kit-twins";
import { render, until } from "./render";
import {
  timeGridAnchor,
  timeGridAnnotationSources,
  timeGridAnnotations,
  timeGridAvailability,
  timeGridEvents,
  timeGridNow,
  timeGridWeekRules,
  timeGridZones,
  type TimeGridFixture,
} from "./time-grid-fixture";

// React's week and day render what `view-twins/` stores, and `solid/time-grid.a11y.tsx` checks the
// Solid views render the same (ADR 0279): roles, names, classes, keys, inline styles and what an
// agent reads.
// React's run writes the files, with `-u` on a change.

const Calendar = createCalendar<TimeGridFixture>()({
  eventAdapter: createCanonicalEventAdapter<{ readonly color: CalendarEventColor }, string>(),
  views: [
    createWeekView<TimeGridFixture>({
      dayView: "day",
      getEventColor: (event) => event.data.color,
    }),
    createDayView<TimeGridFixture>({ getEventColor: (event) => event.data.color }),
  ],
});

const grid = () => document.querySelector('[data-slot="time-grid"]')!;

function TimeGrid(props: { readonly annotated?: boolean; readonly view: "day" | "week" }) {
  return (
    <Calendar.Root
      {...(props.annotated === true && {
        annotationSources: timeGridAnnotationSources,
        annotations: timeGridAnnotations,
        availability: timeGridAvailability,
      })}
      defaultAnchorDate={timeGridAnchor}
      defaultTimeZone="UTC"
      defaultView={props.view}
      events={timeGridEvents}
      locale="en-US"
      now={timeGridNow}
      onEventChange={() => {}}
      secondaryTimeZones={props.view === "day" ? timeGridZones : undefined}
      weekRules={timeGridWeekRules}
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
describe.runIf(server.browser === "chromium")("time grid twins", () => {
  test("the week, with its all-day row collapsed", async () => {
    await render(<TimeGrid view="week" />);
    await until(() => expect(grid().querySelector('[data-slot="time-grid-now"]')).not.toBeNull());
    await expect(describeLayout(grid())).toMatchFileSnapshot("./view-twins/week.txt");
  });

  test("the week, with a slot focused and a keyboard draft on it", async () => {
    await render(<TimeGrid view="week" />);
    await until(() => expect(grid().querySelector('[data-slot="time-grid-now"]')).not.toBeNull());
    // From today's all-day cell, the grid's tab stop, to its first slot, then a create there.
    grid().querySelector<HTMLElement>('[tabindex="0"]')!.focus();
    await userEvent.keyboard("{ArrowDown} ");
    await until(() => expect(grid().querySelector('[data-slot="time-grid-draft"]')).not.toBeNull());
    await expect(describeLayout(grid())).toMatchFileSnapshot("./view-twins/week-draft.txt");
    await userEvent.keyboard("{Escape}");
  });

  test("the week, with annotations and working hours, and a slot focused in both", async () => {
    await render(<TimeGrid annotated view="week" />);
    await until(() => expect(grid().querySelector('[data-slot="annotation-mark"]')).not.toBeNull());
    // Thursday's first slot, at midnight: closed, and in Wednesday night's sleep.
    grid().querySelector<HTMLElement>('[tabindex="0"]')!.focus();
    await userEvent.keyboard("{ArrowDown}");
    await until(() => expect(document.activeElement?.getAttribute("role")).toBe("button"));
    await expect(describeLayout(grid())).toMatchFileSnapshot("./view-twins/week-annotations.txt");
  });

  test("the day, with a second time zone", async () => {
    await render(<TimeGrid view="day" />);
    await until(() => expect(grid().querySelector('[data-slot="time-grid-now"]')).not.toBeNull());
    await expect(describeLayout(grid())).toMatchFileSnapshot("./view-twins/day.txt");
  });
});
