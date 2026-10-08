import { CheckIcon } from "lucide-react";
import { useId } from "react";

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
            <label
              data-color={calendar.color}
              className="flex h-8 cursor-pointer items-center gap-3 rounded-md px-2 text-sm hover:bg-accent"
            >
              <span className="relative grid size-4 shrink-0 place-items-center">
                <input
                  type="checkbox"
                  checked={!hidden.has(calendar.id)}
                  onChange={() => onToggle(calendar.id)}
                  className="peer absolute inset-0 cursor-pointer appearance-none rounded-[4px] border-2 border-calendar-event-border outline-none checked:bg-calendar-event-border focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
                <CheckIcon
                  aria-hidden
                  className="pointer-events-none relative size-3 text-background opacity-0 peer-checked:opacity-100"
                  strokeWidth={3.5}
                />
              </span>
              {calendar.name}
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
