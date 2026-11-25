// @vitest-environment jsdom

import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarAvailability,
  type CalendarEvent,
  type CalendarFocus,
} from "@moltenship/calendar-solid";
import { expect, test } from "vite-plus/test";

import type { UnavailableTimeRender } from "@registry/calendar/unavailable-time";
import { createWeekView } from "@registry/time-grid-view/time-grid-view";

import { render } from "./render";
import { ariaLabel } from "./view-fixtures";

// The week's working-hours tests from React's registry/tests/availability-views.test.tsx, in
// Solid: the same shading, reasons and slot names.

type Shift = CalendarEvent<null, string>;

const time = (value: string) => Temporal.PlainTime.from(value);
/** Weekdays 09:00 to 17:00, and an offsite that closes Friday, October 9. */
const officeHours: CalendarAvailability = {
  exceptions: [{ date: Temporal.PlainDate.from("2026-10-09"), label: "Offsite" }],
  weekly: [{ days: [1, 2, 3, 4, 5], end: time("17:00"), start: time("09:00") }],
};

async function renderWeek(
  options: { readonly renderUnavailable?: UnavailableTimeRender } = {},
  defaultFocus: CalendarFocus | null = null,
) {
  const Calendar = createCalendar<Shift>()({
    eventAdapter: createCanonicalEventAdapter<null, string>(),
    views: [createWeekView<Shift>(options)],
  });
  const { container } = await render(() => (
    <Calendar.Root
      availability={officeHours}
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultFocus={defaultFocus}
      defaultTimeZone="America/New_York"
      defaultView="week"
      events={[]}
      locale="en-US"
      now={Temporal.Instant.from("2026-10-08T16:30:00Z")}
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <Calendar.ActiveView />
    </Calendar.Root>
  ));
  return container;
}

/** A shaded element's extent along its axis, in hours of its day. */
function hours(element: Element): string {
  const { height, top } = (element as HTMLElement).style;
  const hour = (percent: number) => Math.round(percent * 0.24 * 100) / 100;
  return `${hour(parseFloat(top))}-${hour(parseFloat(top) + parseFloat(height))}`;
}

const bands = (container: Element, date: string) => [
  ...container.querySelectorAll<HTMLElement>(
    `[data-date="${date}"]:not([data-all-day]) [data-slot="time-grid-unavailable"]`,
  ),
];

test("the week shades time outside working hours, and a focused slot says so", async () => {
  const container = await renderWeek(
    {},
    { date: Temporal.PlainDate.from("2026-10-08"), kind: "slot", time: time("08:45") },
  );
  const shading = (date: string) => bands(container, date).map(hours);

  expect(shading("2026-10-08")).toEqual(["0-9", "17-24"]);
  // The offsite closes Friday, and the weekend is closed.
  expect(shading("2026-10-09")).toEqual(["0-24"]);
  expect(shading("2026-10-10")).toEqual(["0-24"]);
  const day = container.querySelector('[data-date="2026-10-08"]:not([data-all-day])');
  expect(ariaLabel(day!.querySelector('[role="button"]'))).toBe(
    "Thursday, October 8 at 8:45 AM, outside working hours",
  );
});

test("closed time says why, where open time meets it, and where it sits", async () => {
  const container = await renderWeek();
  const [morning, evening] = bands(container, "2026-10-08");

  expect(morning!.dataset).toMatchObject({ opensAfter: "", reason: "outside-hours" });
  expect(morning!.hasAttribute("data-opens-before")).toBe(false);
  expect(evening!.dataset).toMatchObject({ opensBefore: "", reason: "outside-hours" });
  expect(morning!.getAttribute("aria-hidden")).toBe("true");
  expect(evening!.style.getPropertyValue("--band-start")).toMatch(/^70\.83/);
  expect(evening!.style.getPropertyValue("--band-end")).toBe("100%");
  expect(bands(container, "2026-10-09")[0]!.dataset).toMatchObject({
    label: "Offsite",
    reason: "exception",
  });
  expect(bands(container, "2026-10-10")[0]!.dataset).toMatchObject({ reason: "closed-day" });
});

test("the week's renderUnavailable replaces the shading", async () => {
  const renderUnavailable: UnavailableTimeRender = (props, { band, date, resource }) => (
    <div
      {...props}
      data-date-of={date.toString()}
      data-tint={resource === null ? "calendar" : "resource"}
      data-why={band.reason}
    />
  );
  const container = await renderWeek({ renderUnavailable });

  expect(
    bands(container, "2026-10-09").map(
      ({ dataset }) => `${dataset.tint} ${dataset.why} ${dataset.dateOf}`,
    ),
  ).toEqual(["calendar exception 2026-10-09"]);
  expect(bands(container, "2026-10-08")).toHaveLength(2);
});
