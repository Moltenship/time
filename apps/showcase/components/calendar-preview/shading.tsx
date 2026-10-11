import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { createCalendar, defineEventAdapter } from "@moltenship/calendar";
import { useId, useState } from "react";

import { calendarAnnouncements } from "@registry/calendar/announcements";
import { createWeekView } from "@registry/time-grid-view/time-grid-view";

import { previewAvailability } from "./availability";
import { applyPreviewChange, createPreviewEvents, type PreviewEvent } from "./events";

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

/** The recipes in `global.css`, by the `data-recipe` they style under. */
const shadingRecipes = [
  { label: "Default", value: "default" },
  { label: "Gradient", value: "gradient" },
  { label: "Hatching", value: "hatching" },
  { label: "Brand tint", value: "brand" },
] as const;

type ShadingRecipe = (typeof shadingRecipes)[number]["value"];

/**
 * This week with office hours and a holiday on Friday, shaded by whichever recipe the toggle
 * picks. Edits stay in memory.
 */
export default function ShadingCalendar() {
  const [now] = useState(() => Temporal.Now.zonedDateTimeISO());
  const [events, setEvents] = useState(() => createPreviewEvents(now));
  const [recipe, setRecipe] = useState<ShadingRecipe>("gradient");
  const labelId = useId();

  return (
    <Calendar.Root
      availability={previewAvailability(now.toPlainDate())}
      defaultAnchorDate={now.toPlainDate()}
      defaultTimeZone={now.timeZoneId}
      events={events}
      locale="en-US"
      onEventChange={(change) => setEvents((current) => applyPreviewChange(current, change))}
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <Calendar.Frame className="flex h-full flex-col" data-recipe={recipe}>
        <div className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
          <span className="font-mono text-sm" id={labelId}>
            recipe
          </span>
          <ToggleGroup
            aria-labelledby={labelId}
            className="flex gap-1 rounded-full bg-fd-muted p-1"
            onValueChange={([next]) => {
              if (next !== undefined) setRecipe(next);
            }}
            value={[recipe]}
          >
            {shadingRecipes.map(({ label, value }) => (
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
  );
}
