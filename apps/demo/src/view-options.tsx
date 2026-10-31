import { RepeatIcon } from "lucide-react";

import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";

import { demoCalendars, getCalendarColor } from "./calendars";
import type { DemoOccurrence, DemoView } from "./demo-model";
import { viewFor } from "./scrolling";

/** One element for every repeating event's chip; the views hide it from assistive technology. */
const repeatIcon = <RepeatIcon />;

/** What every view of the demo is created with, whichever flavour of the views it is. */
export const demoViewOptions = {
  // Read after each event's title and time:
  // "Standup, Thursday, October 8, 9:30 – 9:45 AM, Work calendar, repeating event".
  describeEvent: ({ event, recurrence }: DemoOccurrence) =>
    [
      `${demoCalendars.find(({ id }) => id === event.calendarId)?.name ?? "Unknown"} calendar`,
      ...(recurrence === undefined ? [] : ["repeating event"]),
    ].join(", "),
  getEventColor: ({ event }: DemoOccurrence): CalendarEventColor =>
    getCalendarColor(event.calendarId),
  // The mark the description above puts in words.
  getEventIcon: ({ recurrence }: DemoOccurrence) => (recurrence === undefined ? null : repeatIcon),
};

const viewChoices: readonly {
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
