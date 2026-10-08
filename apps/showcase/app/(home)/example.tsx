import { createCalendar, defineEventAdapter } from "@moltenship/calendar";

interface Meeting {
  id: string;
  title: string;
  roomIds: string[];
  start: Temporal.Instant;
  end: Temporal.Instant;
}

const Calendar = createCalendar<Meeting, { id: string }>({
  eventAdapter: defineEventAdapter<Meeting>()({
    getId: (meeting) => meeting.id,
    getTitle: (meeting) => meeting.title,
    getResourceIds: (meeting) => meeting.roomIds,
    getInterval: ({ start, end }) => ({ kind: "timed", start, end }),
  }),
});

export function Schedule({ meetings }: { meetings: Meeting[] }) {
  return (
    <Calendar.Root
      events={meetings}
      defaultAnchorDate={Temporal.Now.plainDateISO()}
      timeZone="Europe/Lisbon"
      locale="en-GB"
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <Calendar.Toolbar>
        <Calendar.PreviousTrigger>Back</Calendar.PreviousTrigger>
        <Calendar.Title />
        <Calendar.NextTrigger>Next</Calendar.NextTrigger>
      </Calendar.Toolbar>
      <Calendar.ActiveView />
    </Calendar.Root>
  );
}
