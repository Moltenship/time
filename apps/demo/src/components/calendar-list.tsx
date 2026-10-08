import { useId } from "react";

import { Checkbox } from "@registry/ui/checkbox";
import { Label } from "@registry/ui/label";

import { demoCalendars, type DemoCalendarId } from "../calendars";

export interface CalendarListProps {
  readonly hidden: ReadonlySet<DemoCalendarId>;
  readonly onToggle: (calendarId: DemoCalendarId) => void;
}

export function CalendarList({ hidden, onToggle }: CalendarListProps) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="px-2 pb-1 text-sm font-medium">
        My calendars
      </h2>
      <ul>
        {demoCalendars.map((calendar) => (
          <li key={calendar.id}>
            <Label className="h-8 cursor-pointer gap-3 rounded-md px-2 font-normal hover:bg-accent">
              <Checkbox
                checked={!hidden.has(calendar.id)}
                className="border-2 border-calendar-event-border data-checked:border-calendar-event-border data-checked:bg-calendar-event-border data-checked:text-background dark:data-checked:bg-calendar-event-border"
                data-color={calendar.color}
                onCheckedChange={() => onToggle(calendar.id)}
              />
              {calendar.name}
            </Label>
          </li>
        ))}
      </ul>
    </section>
  );
}
