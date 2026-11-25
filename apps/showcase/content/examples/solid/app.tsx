// #region app
import type { CalendarProposalDetail, CalendarWeekRules } from "@moltenship/calendar-solid";
import { createSignal } from "solid-js";

import { Calendar, type Meeting } from "./calendar";

const timeZone = "Europe/Berlin";
const at = (value: string) =>
  Temporal.PlainDateTime.from(value).toZonedDateTime(timeZone).toInstant();

export const seed: readonly Meeting[] = [
  {
    id: "standup",
    title: "Standup",
    interval: { kind: "timed", start: at("2026-10-08T09:00"), end: at("2026-10-08T09:30") },
  },
];

export const weekRules: CalendarWeekRules = { firstDay: 1, minimalDays: 4, weekend: [6, 7] };

// A title an agent sent with `createEvent` or `updateEvent`. A person's gesture sends none.
function titleFrom(detail: CalendarProposalDetail): string | undefined {
  const title = detail.fields?.title;
  return typeof title === "string" && title.trim() !== "" ? title.trim() : undefined;
}

export function App() {
  const [meetings, setMeetings] = createSignal<readonly Meeting[]>(seed);

  return (
    <Calendar.Root
      label="Team calendar"
      events={meetings()}
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone={timeZone}
      locale="en-US"
      weekRules={weekRules}
      onEventChange={(change, detail) => {
        const title = titleFrom(detail);
        if (change.cause === "delete") {
          setMeetings((current) => current.filter((meeting) => meeting.id !== change.eventId));
        } else if (change.cause === "create") {
          setMeetings((current) => [
            ...current,
            { id: crypto.randomUUID(), title: title ?? "New meeting", interval: change.proposed },
          ]);
        } else {
          setMeetings((current) =>
            current.map((meeting) =>
              meeting.id === change.eventId
                ? { ...meeting, title: title ?? meeting.title, interval: change.proposed }
                : meeting,
            ),
          );
        }
      }}
    >
      <Calendar.Frame>
        <Calendar.Toolbar>
          <Calendar.PreviousTrigger>Previous</Calendar.PreviousTrigger>
          <Calendar.TodayTrigger>Today</Calendar.TodayTrigger>
          <Calendar.NextTrigger>Next</Calendar.NextTrigger>
          <Calendar.Title />
        </Calendar.Toolbar>
        <Calendar.Viewport>
          <Calendar.ActiveView />
        </Calendar.Viewport>
      </Calendar.Frame>
    </Calendar.Root>
  );
}
// #endregion app
