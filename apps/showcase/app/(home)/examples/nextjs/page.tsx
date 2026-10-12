// #region page
import { TeamCalendar } from "./team-calendar";
import { parseLocation, visibleRange } from "./location";
import { findMeetings, getVisitor } from "./meetings";

interface MeetingsPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function MeetingsPage({ searchParams }: MeetingsPageProps) {
  const visitor = await getVisitor();
  // Until the browser has said which zone it's in, render in UTC.
  const timeZone = visitor.timeZone ?? "UTC";
  // Read the clock once, and hand the instant to the browser, so both render the same today.
  const now = Temporal.Now.instant();
  const location = parseLocation(
    await searchParams,
    now.toZonedDateTimeISO(timeZone).toPlainDate(),
  );
  const meetings = await findMeetings(visitor, visibleRange(location, timeZone));

  return (
    <TeamCalendar
      location={location}
      meetings={meetings}
      now={now.toString()}
      timeZone={timeZone}
      timeZoneFromCookie={visitor.timeZone !== undefined}
    />
  );
}
// #endregion page
