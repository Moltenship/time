import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import {
  createCalendar,
  defineEventAdapter,
  type CalendarSecondaryTimeZone,
} from "@moltenship/calendar";
import { useId, useState } from "react";

import { calendarAnnouncements } from "@registry/calendar/announcements";
import { CalendarToolbar } from "@registry/calendar/calendar-toolbar";
import { createWeekView } from "@registry/time-grid-view/time-grid-view";
import { TooltipProvider } from "@registry/ui/tooltip";

import {
  applyPreviewChange,
  createPreviewEvents,
  type PreviewEvent,
  type PreviewEventChange,
} from "./events";

const noResourceIds: readonly never[] = [];

const Calendar = createCalendar<PreviewEvent, never>()({
  eventAdapter: defineEventAdapter<PreviewEvent>()({
    getId: (event) => event.id,
    getInterval: (event) => event,
    getResourceIds: () => noResourceIds,
    getTitle: (event) => event.title,
  }),
  views: [createWeekView<PreviewEvent>({ getEventColor: (event) => event.color })],
});

export const zoneChoices = [
  { label: "None", value: "none", zones: [] },
  { label: "New York", value: "new-york", zones: ["America/New_York"] },
  { label: "Tokyo", value: "tokyo", zones: [{ label: "Tokyo", timeZone: "Asia/Tokyo" }] },
  { label: "India and Nepal", value: "south-asia", zones: ["Asia/Kolkata", "Asia/Kathmandu"] },
] as const satisfies readonly {
  readonly label: string;
  readonly value: string;
  readonly zones: readonly (CalendarSecondaryTimeZone | string)[];
}[];

type ZoneChoice = (typeof zoneChoices)[number]["value"];

/**
 * This week in the visitor's time zone, with a toggle between sets of secondary time zones. Edits
 * stay in memory.
 */
export default function TimeZonesCalendar() {
  const [now] = useState(() => Temporal.Now.zonedDateTimeISO());
  const [events, setEvents] = useState(() => createPreviewEvents(now));
  const [choice, setChoice] = useState<ZoneChoice>("new-york");
  const labelId = useId();
  const zones = zoneChoices.find(({ value }) => value === choice)!.zones;

  const changeEvent = (change: PreviewEventChange) =>
    setEvents((current) => applyPreviewChange(current, change));

  return (
    <TooltipProvider delay={400}>
      <Calendar.Root
        defaultAnchorDate={now.toPlainDate()}
        defaultTimeZone={now.timeZoneId}
        events={events}
        locale="en-US"
        onEventChange={changeEvent}
        secondaryTimeZones={zones}
        weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
      >
        <Calendar.Frame className="flex h-full flex-col">
          <CalendarToolbar calendar={Calendar} className="border-b" />
          <div className="flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-2">
            <span className="font-mono text-sm" id={labelId}>
              secondaryTimeZones
            </span>
            <ToggleGroup
              aria-labelledby={labelId}
              className="flex flex-wrap gap-1 rounded-full bg-fd-muted p-1"
              onValueChange={([next]) => {
                if (next !== undefined) setChoice(next);
              }}
              value={[choice]}
            >
              {zoneChoices.map(({ label, value }) => (
                <Toggle
                  key={value}
                  className="rounded-full px-3 py-1 text-sm text-fd-foreground transition-colors outline-none hover:bg-fd-background/60 focus-visible:ring-2 focus-visible:ring-fd-ring data-pressed:bg-fd-background data-pressed:font-medium data-pressed:shadow-sm"
                  value={value}
                >
                  {label}
                </Toggle>
              ))}
            </ToggleGroup>
          </div>
          <Calendar.Viewport className="min-h-0 flex-1">
            <Calendar.ActiveView />
          </Calendar.Viewport>
          <Calendar.Announcer messages={calendarAnnouncements} />
        </Calendar.Frame>
      </Calendar.Root>
    </TooltipProvider>
  );
}
