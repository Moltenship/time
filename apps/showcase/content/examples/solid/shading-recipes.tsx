// Availability's shading recipes on the Solid week: this week's office hours and a holiday on
// Friday, shaded by the recipe the control picks (`shading-recipes.css`).

import type { CalendarAvailability } from "@moltenship/calendar-solid";
import {
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
} from "@ui-sdk/solid/segmented-control";
import { createSignal, For } from "solid-js";

import "./shading-recipes.css";
import { Calendar, type Event } from "./week-page";

const recipes = [
  { label: "Default", value: "default" },
  { label: "Gradient", value: "gradient" },
  { label: "Hatching", value: "hatching" },
  { label: "Brand tint", value: "brand" },
] as const;

const time = (value: string) => Temporal.PlainTime.from(value);

function officeHours(today: Temporal.PlainDate): CalendarAvailability {
  return {
    exceptions: [{ date: today.add({ days: 5 - today.dayOfWeek }), label: "Company holiday" }],
    weekly: [{ days: [1, 2, 3, 4, 5], start: time("09:00"), end: time("17:00") }],
  };
}

/** Two meetings this week, one of them in the evening, so the shading shows behind an event. */
function thisWeek(today: Temporal.PlainDate, timeZone: string): readonly Event[] {
  const monday = today.subtract({ days: today.dayOfWeek - 1 });
  const at = (days: number, hour: number) =>
    monday
      .add({ days })
      .toZonedDateTime({ plainTime: time(`${hour}:00`), timeZone })
      .toInstant();
  return [
    {
      data: { color: "blue" },
      end: at(1, 11),
      id: "review",
      kind: "timed",
      start: at(1, 10),
      title: "Design review",
    },
    {
      data: { color: "orange" },
      end: at(2, 19),
      id: "launch",
      kind: "timed",
      start: at(2, 17),
      title: "Launch call",
    },
  ];
}

// #region page
// The recipes in `shading-recipes.css` apply under the frame's `data-recipe`.
export default function ShadingRecipesPage() {
  const now = Temporal.Now.zonedDateTimeISO();
  const [events, setEvents] = createSignal(thisWeek(now.toPlainDate(), now.timeZoneId));
  const [recipe, setRecipe] = createSignal<string>("gradient");
  return (
    <Calendar.Root
      availability={officeHours(now.toPlainDate())}
      defaultAnchorDate={now.toPlainDate()}
      defaultTimeZone={now.timeZoneId}
      defaultView="week"
      events={events()}
      locale="en-US"
      onEventChange={(change) => {
        if (change.cause === "create" || change.cause === "delete") return;
        setEvents((all) =>
          all.map((event) =>
            event.id === change.eventId ? { ...event, ...change.proposed } : event,
          ),
        );
      }}
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <Calendar.Frame class="flex h-dvh flex-col" data-recipe={recipe()}>
        <div class="flex h-14 shrink-0 items-center border-b px-4">
          <SegmentedControl
            aria-label="Recipe"
            class="relative isolate flex gap-1 rounded-full bg-muted p-1"
            onValueChange={(next) => {
              if (next !== null && next !== undefined) setRecipe(String(next));
            }}
            value={recipe()}
          >
            <SegmentedControlIndicator class="absolute top-(--segmented-control-indicator-top) left-(--segmented-control-indicator-left) -z-10 h-(--segmented-control-indicator-height) w-(--segmented-control-indicator-width) rounded-full bg-background shadow-sm transition-all duration-200 data-[activation-direction=none]:transition-none" />
            <For each={recipes}>
              {(item) => (
                <SegmentedControlItem
                  class="relative rounded-full px-3 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring data-checked:font-medium"
                  value={item.value}
                >
                  {item.label}
                </SegmentedControlItem>
              )}
            </For>
          </SegmentedControl>
        </div>
        <Calendar.Viewport class="min-h-0 flex-1">
          <Calendar.ActiveView />
        </Calendar.Viewport>
      </Calendar.Frame>
    </Calendar.Root>
  );
}
// #endregion page
