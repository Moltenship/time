import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { useId } from "react";

import { demoCalendars, type DemoCalendarId } from "../../calendars";
import { listProps, SectionHeading } from "./section";
import { Swatch } from "./swatch";

export interface CalendarListProps {
  readonly hidden: ReadonlySet<DemoCalendarId>;
  readonly onToggle: (calendarId: DemoCalendarId) => void;
}

export function CalendarList({ hidden, onToggle }: CalendarListProps) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId}>
      <SectionHeading id={headingId}>My calendars</SectionHeading>
      <ul {...listProps}>
        {demoCalendars.map((calendar) => (
          <li key={calendar.id}>
            <CheckboxInput
              label={calendar.name}
              labelIcon={<Swatch color={calendar.color} />}
              onChange={() => onToggle(calendar.id)}
              value={!hidden.has(calendar.id)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
