"use client";

// #region view
import { defineCalendarView, timeGridStrategy, useCalendarPointer } from "@moltenship/calendar";

export const myWeekView = defineCalendarView({
  name: "week",
  strategy: timeGridStrategy({ kind: "week" }),
  Renderer: function MyWeek({ actions, environment, events, projection }) {
    const ref = useCalendarPointer({
      columns: projection.days.map((day) => day.column),
      events,
      onPropose: actions.proposeEventChange,
      timeZone: environment.timeZone,
    });

    return <div ref={ref}>{/* Day columns with data-date, events with data-event-id */}</div>;
  },
});
// #endregion view
