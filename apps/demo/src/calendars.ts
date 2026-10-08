import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";

export const demoCalendars = [
  { color: "blue", id: "work", name: "Work" },
  { color: "purple", id: "personal", name: "Personal" },
  { color: "orange", id: "family", name: "Family" },
  { color: "green", id: "fitness", name: "Fitness" },
  { color: "teal", id: "travel", name: "Travel" },
] as const satisfies readonly {
  readonly color: CalendarEventColor;
  readonly id: string;
  readonly name: string;
}[];

export type DemoCalendarId = (typeof demoCalendars)[number]["id"];

export function isDemoCalendarId(value: unknown): value is DemoCalendarId {
  return demoCalendars.some((calendar) => calendar.id === value);
}

export function getCalendarColor(calendarId: DemoCalendarId): CalendarEventColor {
  return demoCalendars.find((calendar) => calendar.id === calendarId)?.color ?? "gray";
}
