import type { CalendarAvailability, CalendarEvent } from "@moltenship/calendar";

import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";

import { describeTree } from "./kit-twins";
import { monthEvents } from "./month-fixture";

/*
 * One year for React's and Solid's browser files (ADR 0279): the same events, hours and closed
 * days, so `view-twins/` compares what the two year views render.
 */

export type YearFixture = CalendarEvent<{ readonly color: CalendarEventColor }, string>;

export const yearAnchor = Temporal.PlainDate.from("2026-10-08");
export const yearNow = Temporal.Instant.from("2026-10-08T10:20:00Z");
export const yearWeekRules = { firstDay: 1, minimalDays: 4, weekend: [6, 7] } as const;

/** Weekdays 09:00 to 17:00, an offsite on Friday, October 9, and Christmas. */
export const yearAvailability: CalendarAvailability = {
  exceptions: [
    { date: Temporal.PlainDate.from("2026-10-09"), label: "Offsite" },
    { date: Temporal.PlainDate.from("2026-12-25"), label: "Christmas" },
  ],
  weekly: [
    {
      days: [1, 2, 3, 4, 5],
      end: Temporal.PlainTime.from("17:00"),
      start: Temporal.PlainTime.from("09:00"),
    },
  ],
};

/** The month's events, so October's days have dots of every colour, and a trip across March. */
export const yearEvents: readonly YearFixture[] = [
  ...monthEvents,
  {
    data: { color: "green" },
    end: Temporal.PlainDate.from("2026-04-02"),
    id: "Trip",
    kind: "all-day",
    start: Temporal.PlainDate.from("2026-03-28"),
    title: "Trip",
  },
];

/** The month the twins describe in full, with its dots, closed day and today. */
export const describedMonth = "2026-10";

/**
 * The year, short enough to store: the view and October in full, as `describeTree` writes them,
 * and every other day as one line of its cell's name, state and dots. October shows every class a
 * day can have; the lines show that each day of the year is named and marked the same.
 */
export function describeYear(view: Element, ...popups: readonly Element[]): string {
  const shallow = (element: Element) => element.cloneNode(false) as Element;
  const months = view.querySelector('[data-slot="year-month"]')!.parentElement!;
  const october = view.querySelector(`[data-month="${describedMonth}"]`)!;
  const days = [...view.querySelectorAll<HTMLElement>('[role="gridcell"][data-date]')]
    .filter((cell) => !october.contains(cell))
    .map((cell) => {
      const dots = [...cell.querySelectorAll('[data-slot="year-event-dot"]')].map(
        (dot) => dot.getAttribute("data-color") ?? "default",
      );
      const marks = [
        cell.getAttribute("aria-current") === null ? "" : " today",
        cell.hasAttribute("data-closed") ? " closed" : "",
        cell.querySelector('[data-slot="year-closed"]') === null ? "" : " shaded",
        cell.querySelector("button")?.getAttribute("aria-expanded") === "true" ? " open" : "",
      ].join("");
      const dotted = dots.length === 0 ? "" : ` [${dots.join(" ")}]`;
      return `${cell.getAttribute("data-date")} "${cell.getAttribute("aria-label")}"${marks}${dotted}`;
    });
  return [
    describeTree(shallow(view), shallow(months), october, ...popups),
    "Every other day:",
    ...days,
    "",
  ].join("\n");
}
