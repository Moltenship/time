// #region page
// app/calendar/page.tsx (a Server Component)
import { TeamCalendar, type MeetingJson } from "./team-calendar";

async function getMeetings(): Promise<readonly MeetingJson[]> {
  // Replace with your database or API call. Return ISO 8601 strings, not Temporal objects.
  return [
    { id: "standup", title: "Standup", start: "2026-10-08T07:00:00Z", end: "2026-10-08T07:15:00Z" },
  ];
}

export default async function CalendarPage() {
  const meetings = await getMeetings();

  return (
    <TeamCalendar
      meetings={meetings}
      now={Temporal.Now.instant().toString()}
      timeZone="Europe/Berlin"
    />
  );
}
// #endregion page
