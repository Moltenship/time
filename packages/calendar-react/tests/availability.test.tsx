// @vitest-environment jsdom

import {
  createCanonicalEventAdapter,
  timeGridStrategy,
  type CalendarAvailability,
  type CalendarEvent,
  type CalendarResource,
  type TimeGridProjection,
} from "@moltenship/calendar-core";
import { plainDateInterval } from "@moltenship/calendar-temporal";
import { afterEach, expect, test, vi } from "vite-plus/test";

import {
  createCalendar,
  defineCalendarView,
  useCalendarAvailability,
  useClosedDates,
  useTimeGridAvailability,
} from "@moltenship/calendar-react";

import { gateWeekRules } from "./harness/builders";
import { renderWithHarness, type ReactRootHarness } from "./harness/render-harness";
import "./setup";

type Meeting = CalendarEvent<null, string, string>;

const time = (value: string) => Temporal.PlainTime.from(value);
const office = (): CalendarAvailability => ({
  exceptions: [{ date: Temporal.PlainDate.from("2026-10-09"), label: "Offsite" }],
  weekly: [{ days: [1, 2, 3, 4, 5], end: time("17:00"), start: time("09:00") }],
});
const resources: readonly CalendarResource<null>[] = [
  { data: null, id: "london", timeZone: "Europe/London", title: "London" },
];

const snapshots: unknown[] = [];

/** Each column's closed bands in hours, then the closed dates, for the calendar and London. */
function Shading({ projection }: { readonly projection: TimeGridProjection<Meeting> }) {
  snapshots.push(useCalendarAvailability());
  const columns = projection.days.map(({ column }) => column);
  const range = plainDateInterval(columns[0]!.date, columns.at(-1)!.date.add({ days: 1 }));
  const hours = (bands: readonly { readonly height: number; readonly top: number }[]) =>
    bands.map(({ height, top }) => `${top * 24}-${(top + height) * 24}`).join(",");
  const calendar = useTimeGridAvailability(columns);
  const london = useTimeGridAvailability(columns, "london");
  const closed = useClosedDates(range);
  return (
    <ol data-shading>
      {columns.map((column, index) => (
        <li key={column.key}>
          {hours(calendar[index]!)} | {hours(london[index]!)} |{" "}
          {closed.get(column.date.toString())?.label ??
            (closed.has(column.date.toString()) ? "closed" : "open")}
        </li>
      ))}
    </ol>
  );
}

const threeDays = defineCalendarView({
  name: "days",
  strategy: timeGridStrategy<undefined, Meeting>({ count: 3, kind: "days" }),
  Renderer: ({ projection }) => <Shading projection={projection} />,
});

const Calendar = createCalendar<Meeting, CalendarResource<null>>()({
  eventAdapter: createCanonicalEventAdapter<null, string, string>(),
  views: [threeDays],
});

const harnesses: ReactRootHarness[] = [];

afterEach(async () => {
  for (const harness of harnesses.splice(0)) await harness.dispose();
  document.body.replaceChildren();
  snapshots.length = 0;
});

function root(props: Partial<React.ComponentProps<typeof Calendar.Root>> = {}) {
  return (
    <Calendar.Root
      availability={office()}
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      events={[]}
      locale="en-US"
      resources={resources}
      timeZone="America/New_York"
      weekRules={gateWeekRules}
      {...props}
    >
      <Calendar.ActiveView />
    </Calendar.Root>
  );
}

async function render(props: Partial<React.ComponentProps<typeof Calendar.Root>> = {}) {
  const harness = await renderWithHarness(root(props));
  harnesses.push(harness);
  return harness;
}

function shading(container: ParentNode): string[] {
  return [...container.querySelectorAll("[data-shading] li")].map((item) =>
    (item.textContent ?? "").replace(/\s+/g, " "),
  );
}

test("views shade the calendar's closed time and each resource's on its own time zone", async () => {
  const { container } = await render();

  expect(shading(container)).toEqual([
    // Thursday: 09:00–17:00 in New York, and 09:00–17:00 London time, 04:00–12:00 here.
    "0-9,17-24 | 0-4,12-24 | open",
    // Friday is an offsite for everyone.
    "0-24 | 0-24 | Offsite",
    "0-24 | 0-24 | closed",
  ]);
});

test("an inline availability equal to the last keeps the snapshot", async () => {
  const harness = await render();
  const before = snapshots.at(-1);

  await harness.render(root({ locale: "en-GB" }));

  expect(snapshots.at(-1)).toBe(before);
});

test("invalid hours are left out and reported as diagnostics", async () => {
  const onDiagnosticsChange = vi.fn();
  await render({
    availability: { ...office(), timeZone: "Mars/Olympus" },
    onDiagnosticsChange,
  });

  expect(onDiagnosticsChange).toHaveBeenLastCalledWith([
    expect.objectContaining({
      code: "invalid-availability",
      issue: expect.objectContaining({ code: "invalid-time-zone", value: "Mars/Olympus" }),
    }),
  ]);
});

test("invalid entries recreated inline rerender without throwing", async () => {
  const onDiagnosticsChange = vi.fn();
  const broken = () => ({ exceptions: [null], weekly: [null] }) as unknown as CalendarAvailability;
  const harness = await render({ availability: broken(), onDiagnosticsChange });

  await harness.render(root({ availability: broken(), onDiagnosticsChange }));

  expect(onDiagnosticsChange).toHaveBeenLastCalledWith([
    expect.objectContaining({
      issue: expect.objectContaining({ code: "invalid-availability-exception" }),
    }),
    expect.objectContaining({
      issue: expect.objectContaining({ code: "invalid-availability-rule" }),
    }),
  ]);
});

test("fixing a rule's days list replaces the hours, holes included", async () => {
  const days: (1 | 4)[] = [];
  days.length = 1;
  const rule = (ruleDays: readonly (1 | 4)[]): CalendarAvailability => ({
    weekly: [{ days: ruleDays, end: time("17:00"), start: time("09:00") }],
  });
  const harness = await render({ availability: rule(days) });
  expect(shading(harness.container)[0]).toBe("0-24 | 0-24 | closed");

  await harness.render(root({ availability: rule([4]) }));

  expect(shading(harness.container)[0]).toBe("0-9,17-24 | 0-4,12-24 | open");
});
