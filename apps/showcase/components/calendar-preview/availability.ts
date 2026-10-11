import type { AvailabilityRule, CalendarAvailability } from "@moltenship/calendar";

export function hours(
  days: AvailabilityRule["days"],
  start: string,
  end: string,
): AvailabilityRule {
  return { days, end: Temporal.PlainTime.from(end), start: Temporal.PlainTime.from(start) };
}

/** Office hours on weekdays, on the visitor's clock, and a holiday on this week's Friday. */
export function previewAvailability(today: Temporal.PlainDate): CalendarAvailability {
  return {
    exceptions: [{ date: today.add({ days: 5 - today.dayOfWeek }), label: "Company holiday" }],
    weekly: [hours([1, 2, 3, 4, 5], "09:00", "17:00")],
  };
}
