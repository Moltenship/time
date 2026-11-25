import { demoCalendars } from "./calendars";
import type { DemoOccurrence, DemoView } from "./demo-model";
import { viewFor } from "./scrolling";

/**
 * What a view's event chips say after each event's title and time: "Standup, Thursday, October 8,
 * 9:30 – 9:45 AM, Work calendar, repeating event". Each UI's views mark a repeating one with an
 * icon too.
 */
export function describeDemoEvent({ event, recurrence }: DemoOccurrence): string {
  return [
    `${demoCalendars.find(({ id }) => id === event.calendarId)?.name ?? "Unknown"} calendar`,
    ...(recurrence === undefined ? [] : ["repeating event"]),
  ].join(", ");
}

/** The view switcher's views, with the keys that open them. */
export const viewChoices: readonly {
  readonly label: string;
  readonly shortcut: string;
  readonly value: DemoView;
}[] = [
  { label: "Day", shortcut: "D", value: "day" },
  { label: "3 days", shortcut: "X", value: "3-day" },
  { label: "Week", shortcut: "W", value: "week" },
  { label: "Month", shortcut: "M", value: "month" },
  { label: "Year", shortcut: "Y", value: "year" },
  { label: "Agenda", shortcut: "A", value: "agenda" },
  { label: "Resources", shortcut: "R", value: "resources" },
  { label: "Timeline", shortcut: "L", value: "timeline-week" },
];

/** The view switcher's options, in the set the settings choose. */
export function viewSwitcherOptions(scrolling: boolean) {
  return viewChoices.map((option) => ({ ...option, value: viewFor(option.value, scrolling) }));
}
