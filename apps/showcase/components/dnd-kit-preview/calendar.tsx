import { BacklogCalendar, type Meeting, type Task } from "@/content/examples/dnd-kit-backlog";
import { useState } from "react";

import { TooltipProvider } from "@registry/ui/tooltip";

/** Tasks in the backlog to start with. */
export const sampleTasks: readonly Task[] = [
  { id: "task-report", minutes: 90, title: "Draft the report" },
  { id: "task-review", minutes: 45, title: "Review the design" },
  { id: "task-call", minutes: 30, title: "Call the bank" },
];

/** A meeting a weekday of this week, in the visitor's zone, to drag out to the backlog. */
export function sampleMeetings(today: Temporal.PlainDate, timeZone: string): Meeting[] {
  const monday = today.subtract({ days: today.dayOfWeek - 1 });
  const at = (days: number, time: string) =>
    monday
      .add({ days })
      .toZonedDateTime({ plainTime: Temporal.PlainTime.from(time), timeZone })
      .toInstant();
  return [
    { end: at(0, "10:00"), id: "standup", start: at(0, "09:30"), title: "Team sync" },
    { end: at(1, "15:00"), id: "interview", start: at(1, "14:00"), title: "Interview" },
    { end: at(3, "12:00"), id: "planning", start: at(3, "11:00"), title: "Planning" },
  ];
}

/** The guide's backlog and week, in the visitor's time zone. */
export default function DndKitPreviewCalendar() {
  const [timeZone] = useState(() => Temporal.Now.timeZoneId());
  const [today] = useState(() => Temporal.Now.plainDateISO(timeZone));
  return (
    <TooltipProvider delay={400}>
      <BacklogCalendar
        anchorDate={today}
        initialMeetings={sampleMeetings(today, timeZone)}
        initialTasks={sampleTasks}
        timeZone={timeZone}
      />
    </TooltipProvider>
  );
}
