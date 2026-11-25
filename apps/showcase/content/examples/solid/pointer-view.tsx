// #region view
import {
  defineCalendarView,
  timeGridStrategy,
  useCalendarPointer,
} from "@moltenship/calendar-solid";

export const weekView = defineCalendarView({
  name: "week",
  strategy: timeGridStrategy({ kind: "week" }),
  Renderer: (props) => {
    // An accessor, so the layer reads the options as they are when a drag starts.
    const pointer = useCalendarPointer(() => ({
      columns: props.projection.days.map((day) => day.column),
      disabled: props.isReadOnly,
      events: props.events,
      onPropose: props.actions.proposeEventChange,
      // "free" moves a copy of the event with the pointer. Leave it out for a snapped preview.
      preview: "free",
      timeZone: props.environment.timeZone,
    }));

    return (
      <div
        ref={pointer}
        // On a touch screen, a long-press picks an event up instead of selecting its text.
        class={props.isReadOnly ? undefined : "week-editable"}
      >
        {/* Day columns with data-date, events with data-event-id */}
      </div>
    );
  },
});
// #endregion view
