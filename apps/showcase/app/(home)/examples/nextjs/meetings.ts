import type { InstantInterval } from "@moltenship/calendar";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";

import type { CalendarEventColor } from "@/components/calendar/event-colors";

// Stands in for your database and your auth. Each visitor gets their own copy of some sample
// meetings, keyed by a cookie and kept in this server's memory, so it resets when the server does.

// #region types
/** A meeting as the server sends it: Client Components get strings, not Temporal values. */
export interface MeetingJson {
  readonly color: CalendarEventColor;
  readonly end: string;
  readonly id: string;
  readonly start: string;
  readonly title: string;
}
// #endregion types

interface StoredMeeting {
  readonly color: CalendarEventColor;
  readonly end: Temporal.Instant;
  readonly id: string;
  readonly start: Temporal.Instant;
  readonly title: string;
}

/** Who is asking: their session, once they have one, and their time zone. */
export interface Visitor {
  readonly session: string | undefined;
  readonly timeZone: string | undefined;
}

const sessionCookie = "meetings-session";
const timeZoneCookie = "time-zone";
const cookieOptions = {
  httpOnly: true,
  maxAge: 60 * 60 * 24 * 30,
  path: "/examples",
  sameSite: "lax",
} as const;

const maxSessions = 1000;
export const maxMeetings = 200;
/** Saved meetings by session, least recently used first. */
const sessions = new Map<string, StoredMeeting[]>();

/** A session's meetings, which moves it to the end of the queue to evict. */
function meetingsOf(session: string | undefined): StoredMeeting[] | undefined {
  const meetings = session === undefined ? undefined : sessions.get(session);
  if (session !== undefined && meetings !== undefined) {
    sessions.delete(session);
    sessions.set(session, meetings);
  }
  return meetings;
}

/** The canonical ID of a time zone, or `undefined` for a value that isn't one. */
export function timeZoneOf(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 64) return undefined;
  try {
    return Temporal.Now.zonedDateTimeISO(value).timeZoneId;
  } catch {
    return undefined;
  }
}

export async function getVisitor(): Promise<Visitor> {
  const jar = await cookies();
  return {
    session: jar.get(sessionCookie)?.value,
    timeZone: timeZoneOf(jar.get(timeZoneCookie)?.value),
  };
}

export async function setTimeZoneCookie(timeZone: string): Promise<void> {
  (await cookies()).set(timeZoneCookie, timeZone, cookieOptions);
}

/**
 * The visitor's session. A new one starts with the sample meetings the visitor was seeing, at
 * wall-clock times in their zone.
 */
export async function startSession(visitor: Visitor): Promise<string> {
  if (visitor.session !== undefined && meetingsOf(visitor.session) !== undefined) {
    return visitor.session;
  }
  const session = randomUUID();
  sessions.set(session, sampleMeetings(visitor.timeZone ?? "UTC"));
  for (const oldest of sessions.keys()) {
    if (sessions.size <= maxSessions) break;
    sessions.delete(oldest);
  }
  (await cookies()).set(sessionCookie, session, cookieOptions);
  return session;
}

/** The visitor's meetings that overlap `range`, earliest first. */
export async function findMeetings(
  visitor: Visitor,
  range: InstantInterval,
): Promise<readonly MeetingJson[]> {
  const meetings = meetingsOf(visitor.session) ?? sampleMeetings(visitor.timeZone ?? "UTC");
  return meetings
    .filter(
      ({ end, start }) =>
        Temporal.Instant.compare(start, range.end) < 0 &&
        Temporal.Instant.compare(end, range.start) > 0,
    )
    .sort((left, right) => Temporal.Instant.compare(left.start, right.start))
    .map(({ end, start, ...meeting }) => ({
      ...meeting,
      end: end.toString(),
      start: start.toString(),
    }));
}

/** Adds a meeting and returns its ID, or `undefined` when the session is full. */
export function insertMeeting(
  session: string,
  times: Pick<StoredMeeting, "end" | "start">,
): string | undefined {
  const meetings = meetingsOf(session);
  if (meetings === undefined || meetings.length >= maxMeetings) return undefined;
  const id = randomUUID();
  meetings.push({ ...times, color: "blue", id, title: "New meeting" });
  return id;
}

/** Gives a meeting new times; `false` when it doesn't exist. */
export function updateMeeting(
  session: string,
  id: string,
  times: Pick<StoredMeeting, "end" | "start">,
): boolean {
  const meetings = meetingsOf(session);
  const index = meetings?.findIndex((meeting) => meeting.id === id) ?? -1;
  if (meetings === undefined || index === -1) return false;
  meetings[index] = { ...meetings[index]!, ...times };
  return true;
}

/** A team's three weeks around today, at wall-clock times in `timeZone`. */
function sampleMeetings(timeZone: string): StoredMeeting[] {
  const today = Temporal.Now.plainDateISO(timeZone);
  const monday = today.subtract({ days: today.dayOfWeek - 1 });
  const meetings: StoredMeeting[] = [];

  function add(title: string, color: CalendarEventColor, day: number, time: string, minutes = 60) {
    const start = monday
      .add({ days: day })
      .toZonedDateTime({ plainTime: Temporal.PlainTime.from(time), timeZone });
    meetings.push({
      color,
      end: start.add({ minutes }).toInstant(),
      id: `sample-${meetings.length + 1}`,
      start: start.toInstant(),
      title,
    });
  }

  for (let day = -7; day < 14; day += 1) {
    if (day - 7 * Math.floor(day / 7) < 5) add("Standup", "gray", day, "09:30", 15);
  }
  add("Roadmap review", "orange", -6, "11:00");
  add("Weekly planning", "orange", 0, "10:00");
  add("Lunch with Sam", "green", 0, "12:30");
  add("Design review", "blue", 1, "14:00", 90);
  add("1:1 with Maya", "purple", 2, "11:00", 30);
  add("Sprint demo", "orange", 3, "15:00");
  add("Team lunch", "green", 4, "12:00", 90);
  add("Climbing", "teal", 5, "10:30", 120);
  add("Offsite planning", "blue", 8, "13:00", 120);
  return meetings;
}
