// #region view
import {
  defineCalendarView,
  timeGridStrategy,
  useTimeGridAvailability,
} from "@moltenship/calendar-solid";
import { For } from "solid-js";

export const weekView = defineCalendarView({
  name: "week",
  strategy: timeGridStrategy({ kind: "week" }),
  Renderer: (props) => {
    // One list of closed bands per column, as fractions of the column's 24 hours.
    const closed = useTimeGridAvailability(() => props.projection.days.map((day) => day.column));

    return (
      <div class="week">
        <For each={props.projection.days}>
          {(day, index) => (
            <div class="week-day" data-date={day.column.date.toString()}>
              <For each={closed()[index()]}>
                {(band) => (
                  <div
                    class="closed"
                    aria-hidden="true"
                    data-reason={band.reason}
                    data-label={band.label}
                    style={{ top: `${band.top * 100}%`, height: `${band.height * 100}%` }}
                  />
                )}
              </For>
              {/* The day's events */}
            </div>
          )}
        </For>
      </div>
    );
  },
});
// #endregion view
