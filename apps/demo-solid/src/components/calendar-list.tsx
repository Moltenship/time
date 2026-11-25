import { createUniqueId, For } from "solid-js";

import { demoCalendars, type DemoCalendarId } from "@demo/calendars";

import { Checkbox } from "../ui/checkbox";
import { Label } from "../ui/label";

export function CalendarList(props: {
  readonly hidden: ReadonlySet<DemoCalendarId>;
  readonly onToggle: (calendarId: DemoCalendarId) => void;
}) {
  const headingId = createUniqueId();
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} class="px-2 pb-1 text-sm font-medium">
        My calendars
      </h2>
      <ul>
        <For each={demoCalendars}>
          {(calendar) => (
            <li>
              <Label class="h-8 cursor-pointer gap-3 rounded-md px-2 font-normal hover:bg-accent">
                <Checkbox
                  checked={!props.hidden.has(calendar.id)}
                  class="border-2 border-calendar-event-border data-checked:border-calendar-event-border data-checked:bg-calendar-event-border data-checked:text-background dark:data-checked:bg-calendar-event-border"
                  data-color={calendar.color}
                  onCheckedChange={() => props.onToggle(calendar.id)}
                />
                {calendar.name}
              </Label>
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}
