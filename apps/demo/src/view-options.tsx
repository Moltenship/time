import { RepeatIcon } from "lucide-react";

import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";

import { getCalendarColor } from "./calendars";
import type { DemoOccurrence } from "./demo-model";
import { describeDemoEvent } from "./view-choices";

/** One element for every repeating event's chip; the views hide it from assistive technology. */
const repeatIcon = <RepeatIcon />;

/** What every view of the demo is created with, whichever flavour of the views it is. */
export const demoViewOptions = {
  describeEvent: describeDemoEvent,
  getEventColor: ({ event }: DemoOccurrence): CalendarEventColor =>
    getCalendarColor(event.calendarId),
  // The mark the description puts in words.
  getEventIcon: ({ recurrence }: DemoOccurrence) => (recurrence === undefined ? null : repeatIcon),
};
