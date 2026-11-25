// The Theming page's example: the theme's event colors, under the switch for the dark theme.

// #region palette
import { For } from "solid-js";

import { EventChip } from "@/components/calendar/event-chip";
import { calendarEventColors } from "@/components/calendar/event-colors";

/** A chip on the default event tokens, and one for each color of the palette. */
export function Palette() {
  return (
    <div class="flex flex-wrap gap-2">
      <EventChip>default</EventChip>
      <For each={calendarEventColors}>
        {(color) => <EventChip color={color}>{color}</EventChip>}
      </For>
    </div>
  );
}
// #endregion palette

import { ThemeToggle } from "./theme-toggle";

/** The page's live example: the switch, and the palette it recolors. */
export function Theme() {
  return (
    <div class="flex flex-col items-start gap-4 p-4">
      <ThemeToggle />
      <Palette />
    </div>
  );
}
