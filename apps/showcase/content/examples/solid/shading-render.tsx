// Availability's own shading for the Solid week and month, after `shadcn add` of their items.

// #region render
import { Show } from "solid-js";

import { createMonthView } from "@/components/calendar/month-view/month-view";
import { createWeekView } from "@/components/calendar/time-grid-view/time-grid-view";
import type { UnavailableTimeRender } from "@/components/calendar/unavailable-time";

import type { Event } from "./week-page";

// A closed date names itself inside its band, such as "Christmas".
const labelHolidays: UnavailableTimeRender = (props, state) => (
  <div {...props}>
    <Show when={state.band.reason === "exception" ? state.band.label : undefined}>
      {(label) => <span class="m-1 block text-xs text-muted-foreground">{label()}</span>}
    </Show>
  </div>
);

export const views = [
  createWeekView<Event>({ renderUnavailable: labelHolidays }),
  createMonthView<Event>({ renderUnavailable: labelHolidays }),
];
// #endregion render
