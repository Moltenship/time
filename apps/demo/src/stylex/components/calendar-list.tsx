import * as stylex from "@stylexjs/stylex";
import { useId } from "react";

import { eventColorStyles } from "@registry/stylex-calendar-theme/event-color-styles";

import { demoCalendars, type DemoCalendarId } from "../../calendars";
import { Checkbox } from "../ui/checkbox";
import { Label } from "../ui/field";
import { sectionStyles } from "./section";

export interface CalendarListProps {
  readonly hidden: ReadonlySet<DemoCalendarId>;
  readonly onToggle: (calendarId: DemoCalendarId) => void;
}

export function CalendarList({ hidden, onToggle }: CalendarListProps) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} {...stylex.props(sectionStyles.heading)}>
        My calendars
      </h2>
      <ul>
        {demoCalendars.map((calendar) => (
          <li key={calendar.id}>
            <Label xstyle={sectionStyles.row}>
              <Checkbox
                checked={!hidden.has(calendar.id)}
                colored
                data-color={calendar.color}
                onCheckedChange={() => onToggle(calendar.id)}
                xstyle={eventColorStyles[calendar.color]}
              />
              {calendar.name}
            </Label>
          </li>
        ))}
      </ul>
    </section>
  );
}
