import type { CalendarWeekRules } from "@moltenship/calendar-solid";

import { Calendar, type Event } from "./calendar-page";

const weekRules: CalendarWeekRules = { firstDay: 1, minimalDays: 4, weekend: [6, 7] };

// #region options
export function Schedule(props: { events: readonly Event[]; fetching: boolean }) {
  return (
    <Calendar.Root
      defaultAnchorDate={Temporal.Now.plainDateISO()}
      defaultTimeZone={Temporal.Now.timeZoneId()}
      events={props.events}
      locale="en-GB"
      viewOptions={{ agenda: { loading: props.fetching, weeks: 8 } }}
      weekRules={weekRules}
    >
      <Calendar.ActiveView />
    </Calendar.Root>
  );
}
// #endregion options
