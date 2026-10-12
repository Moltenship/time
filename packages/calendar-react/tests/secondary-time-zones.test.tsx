// @vitest-environment jsdom

import {
  createCanonicalEventAdapter,
  timeGridStrategy,
  type CalendarEnvironmentBase,
  type CalendarEvent,
} from "@moltenship/calendar-core";
import { afterEach, expect, test, vi } from "vite-plus/test";

import { createCalendar, defineCalendarView } from "@moltenship/calendar-react";

import { gateWeekRules } from "./harness/builders";
import { renderWithHarness, type ReactRootHarness } from "./harness/render-harness";
import "./setup";

type Meeting = CalendarEvent<null, string, string>;

const environments: CalendarEnvironmentBase[] = [];

const day = defineCalendarView({
  name: "day",
  strategy: timeGridStrategy<undefined, Meeting>({ count: 1, kind: "days" }),
  Renderer: ({ environment }) => {
    environments.push(environment);
    return null;
  },
});

const Calendar = createCalendar<Meeting, never>()({
  eventAdapter: createCanonicalEventAdapter<null, string, string>(),
  views: [day],
});

const harnesses: ReactRootHarness[] = [];

afterEach(async () => {
  for (const harness of harnesses.splice(0)) await harness.dispose();
  document.body.replaceChildren();
  environments.length = 0;
});

function root(props: Partial<React.ComponentProps<typeof Calendar.Root>> = {}) {
  return (
    <Calendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-12")}
      events={[]}
      locale="en-US"
      timeZone="Europe/Berlin"
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

test("views get no secondary time zones by default", async () => {
  await render();

  expect(environments.at(-1)?.secondaryTimeZones).toEqual([]);
});

test("views get the root's secondary time zones, named as Temporal names them", async () => {
  await render({
    secondaryTimeZones: ["asia/kolkata", { label: "Office", timeZone: "America/New_York" }],
  });

  expect(environments.at(-1)?.secondaryTimeZones).toEqual([
    { timeZone: "Asia/Kolkata" },
    { label: "Office", timeZone: "America/New_York" },
  ]);
  expect(Object.isFrozen(environments.at(-1)?.secondaryTimeZones)).toBe(true);
});

test("an inline list equal to the last keeps the environment", async () => {
  const zones = () => ["Asia/Tokyo", { label: "Office", timeZone: "America/New_York" }];
  const harness = await render({ secondaryTimeZones: zones() });
  const before = environments.at(-1);

  await harness.render(root({ secondaryTimeZones: zones() }));
  expect(environments.at(-1)).toBe(before);

  await harness.render(root({ secondaryTimeZones: ["Asia/Tokyo"] }));
  expect(environments.at(-1)).not.toBe(before);
  expect(environments.at(-1)?.secondaryTimeZones).toEqual([{ timeZone: "Asia/Tokyo" }]);
});

test("invalid zones are left out and reported as diagnostics", async () => {
  const onDiagnosticsChange = vi.fn();
  const harness = await render({
    onDiagnosticsChange,
    secondaryTimeZones: ["Mars/Base", "UTC"],
  });

  expect(environments.at(-1)?.secondaryTimeZones).toEqual([{ timeZone: "UTC" }]);
  expect(onDiagnosticsChange).toHaveBeenLastCalledWith([
    {
      code: "invalid-secondary-time-zone",
      issue: { code: "invalid-secondary-time-zone", index: 0, value: "Mars/Base" },
      severity: "error",
    },
  ]);

  // The same mistake recreated inline reports nothing new; fixing it clears the report.
  onDiagnosticsChange.mockClear();
  await harness.render(root({ onDiagnosticsChange, secondaryTimeZones: ["Mars/Base", "UTC"] }));
  expect(onDiagnosticsChange).not.toHaveBeenCalled();
  await harness.render(root({ onDiagnosticsChange, secondaryTimeZones: ["UTC"] }));
  expect(onDiagnosticsChange).toHaveBeenLastCalledWith([]);
});

test("a value that isn't a list is reported, not thrown", async () => {
  const onDiagnosticsChange = vi.fn();
  await render({ onDiagnosticsChange, secondaryTimeZones: "Asia/Tokyo" as never });

  expect(environments.at(-1)?.secondaryTimeZones).toEqual([]);
  expect(onDiagnosticsChange).toHaveBeenLastCalledWith([
    {
      code: "invalid-secondary-time-zone",
      issue: { code: "invalid-secondary-time-zone", value: "Asia/Tokyo" },
      severity: "error",
    },
  ]);
});

test("a single zone recreated inline where a list belongs keeps the environment", async () => {
  const onDiagnosticsChange = vi.fn();
  const zone = () => ({ timeZone: "Asia/Tokyo" }) as never;
  const harness = await render({ onDiagnosticsChange, secondaryTimeZones: zone() });
  const before = environments.at(-1);
  onDiagnosticsChange.mockClear();

  await harness.render(root({ onDiagnosticsChange, secondaryTimeZones: zone() }));

  expect(environments.at(-1)).toBe(before);
  expect(onDiagnosticsChange).not.toHaveBeenCalled();
});
