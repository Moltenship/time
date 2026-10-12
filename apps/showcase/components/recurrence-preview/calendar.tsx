import { useState } from "react";

import { TeamCalendar } from "@/content/examples/recurrence-root";

import { TooltipProvider } from "@registry/ui/tooltip";

import { createRecurringPreviewEvents } from "./events";

/** The guide's calendar over series seeded around the visitor's week, in their time zone. */
export default function RecurrencePreviewCalendar() {
  const [now] = useState(() => Temporal.Now.zonedDateTimeISO());
  const [events] = useState(() => createRecurringPreviewEvents(now));

  return (
    <TooltipProvider delay={400}>
      <TeamCalendar initialEvents={events} timeZone={now.timeZoneId} />
    </TooltipProvider>
  );
}
