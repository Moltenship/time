import { createCalendar, createCanonicalEventAdapter } from "@moltenship/calendar";
import { describe, expect, test } from "vite-plus/test";
import { server } from "vite-plus/test/browser";

import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import { createResourceColumnsView } from "@registry/resource-columns-view/resource-columns-view";

import { describeLayout } from "./kit-twins";
import { atRest, click, render, until } from "./render";
import {
  columnsAnchor,
  columnsAvailability,
  columnsBookings,
  columnsExpanded,
  columnsNow,
  columnsResources,
  columnsWeekRules,
  type ColumnsBooking,
  type ColumnsResource,
} from "./resource-columns-fixture";

// React's resource columns render what `view-twins/` stores, and `solid/resource-columns.a11y.tsx`
// checks the Solid view renders the same (ADR 0279): roles, names, classes, keys, inline styles and
// what an agent reads. React's run writes the files, with `-u` on a change.

const getEventColor = (event: ColumnsBooking) => event.data.color;
const eventAdapter = createCanonicalEventAdapter<
  { readonly color: CalendarEventColor },
  string,
  string
>();
// A column per resource, with each one's status, and three days per resource.
const OneDay = createCalendar<ColumnsBooking, ColumnsResource>()({
  eventAdapter,
  views: [
    createResourceColumnsView<ColumnsBooking>({
      getEventColor,
      resourceStatus: true,
      unassigned: "bucket",
    }),
  ],
});
const ThreeDays = createCalendar<ColumnsBooking, ColumnsResource>()({
  eventAdapter,
  views: [createResourceColumnsView<ColumnsBooking>({ getEventColor }, 3)],
});

const grid = () => document.querySelector<HTMLElement>('[data-slot="resource-columns"]')!;
const body = () => document.querySelector<HTMLElement>('[data-slot="resource-columns-body"]')!;

function Columns({ days }: { readonly days: 1 | 3 }) {
  const Calendar = days === 1 ? OneDay : ThreeDays;
  return (
    <Calendar.Root
      availability={columnsAvailability}
      defaultAnchorDate={columnsAnchor}
      defaultExpandedResourceIds={columnsExpanded}
      defaultTimeZone="UTC"
      defaultView="resources"
      events={columnsBookings}
      locale="en-US"
      now={columnsNow}
      onEventChange={() => {}}
      resources={columnsResources}
      weekRules={columnsWeekRules}
    >
      <Calendar.Frame className="flex h-[600px] w-[1000px] flex-col">
        <Calendar.Viewport className="min-h-0 flex-1">
          <Calendar.ActiveView />
        </Calendar.Viewport>
      </Calendar.Frame>
    </Calendar.Root>
  );
}

/** Opened on now, with the columns measured. */
async function opened() {
  await until(() => expect(grid().querySelector('[data-event-id="Audit"]')).not.toBeNull());
  await until(() => expect(body().scrollTop).toBeGreaterThan(0));
  await atRest(body());
}

// The descriptions are Chromium's: another engine serializes some attributes its own way.
describe.runIf(server.browser === "chromium")("resource columns twins", () => {
  test("a day, a column per resource, with each one's status and hours", async () => {
    await render(<Columns days={1} />);
    await opened();
    await expect(describeLayout(grid())).toMatchFileSnapshot("./view-twins/resource-columns.txt");
  });

  test("three days per resource, and the team collapsed from its toggle", async () => {
    await render(<Columns days={3} />);
    await opened();
    await expect(describeLayout(grid())).toMatchFileSnapshot(
      "./view-twins/resource-columns-days.txt",
    );

    await click(grid().querySelector<HTMLElement>('[aria-label="Collapse Team"]'));
    await until(() => expect(grid().querySelector('[aria-label="Expand Team"]')).not.toBeNull());
    await atRest(body());
    await expect(describeLayout(grid())).toMatchFileSnapshot(
      "./view-twins/resource-columns-collapsed.txt",
    );
  });
});
