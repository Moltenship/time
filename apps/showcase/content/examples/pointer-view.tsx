"use client";

// #region view
import { defineCalendarView, timeGridStrategy, useCalendarPointer } from "@moltenship/calendar";

export const myWeekView = defineCalendarView({
  name: "week",
  strategy: timeGridStrategy({ kind: "week" }),
  Renderer: function MyWeek({ actions, environment, events, isReadOnly, projection }) {
    const ref = useCalendarPointer({
      columns: projection.days.map((day) => day.column),
      disabled: isReadOnly,
      events,
      onPropose: actions.proposeEventChange,
      timeZone: environment.timeZone,
    });

    return (
      <div
        ref={ref}
        // On a touch screen, a long-press picks an event up instead of selecting its text.
        className={
          isReadOnly
            ? undefined
            : "pointer-coarse:select-none pointer-coarse:[-webkit-touch-callout:none]"
        }
      >
        {/* Day columns with data-date, events with data-event-id */}
      </div>
    );
  },
});
// #endregion view
