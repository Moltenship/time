"use server";

import { refresh } from "next/cache";

import {
  getVisitor,
  insertMeeting,
  setTimeZoneCookie,
  startSession,
  timeZoneOf,
  updateMeeting,
} from "./meetings";

// #region actions
export type SaveResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "invalid" | "in-the-past" | "not-found" | "full" };

interface Times {
  readonly end: string;
  readonly start: string;
}

// Server Actions are public endpoints: check every argument, whatever the calendar sent.
function parseTimes(input: unknown) {
  const { end, start } = (input ?? {}) as Partial<Record<keyof Times, unknown>>;
  if (typeof start !== "string" || typeof end !== "string") return undefined;
  try {
    const times = { end: Temporal.Instant.from(end), start: Temporal.Instant.from(start) };
    const minutes = times.start.until(times.end).total("minutes");
    return minutes >= 15 && minutes <= 24 * 60 ? times : undefined;
  } catch {
    return undefined;
  }
}

/** The rule this server adds on top of the calendar's policies. */
function startsInThePast(times: { readonly start: Temporal.Instant }) {
  return Temporal.Instant.compare(times.start, Temporal.Now.instant()) < 0;
}

export async function createMeeting(input: Times): Promise<SaveResult> {
  const times = parseTimes(input);
  if (times === undefined) return { ok: false, reason: "invalid" };
  if (startsInThePast(times)) return { ok: false, reason: "in-the-past" };

  const session = await startSession(await getVisitor());
  if (insertMeeting(session, times) === undefined) return { ok: false, reason: "full" };
  // Re-render the page in this response, so the new meeting arrives with its ID.
  refresh();
  return { ok: true };
}

/** Moves and both resizes send the meeting's new start and end. */
export async function moveMeeting(input: Times & { readonly id: string }): Promise<SaveResult> {
  const times = parseTimes(input);
  const id: unknown = input?.id;
  if (times === undefined || typeof id !== "string") return { ok: false, reason: "invalid" };
  if (startsInThePast(times)) return { ok: false, reason: "in-the-past" };

  const session = await startSession(await getVisitor());
  if (!updateMeeting(session, id, times)) return { ok: false, reason: "not-found" };
  refresh();
  return { ok: true };
}
// #endregion actions

// #region time-zone
export async function saveTimeZone(input: string): Promise<void> {
  const timeZone = timeZoneOf(input);
  if (timeZone === undefined) return;
  const visitor = await getVisitor();
  // Switching zones keeps the meetings at the instants the visitor saw, so they move on the clock.
  // A first visit has no zone to keep, and its sample meetings simply follow the new one.
  if (visitor.timeZone !== undefined && visitor.timeZone !== timeZone) await startSession(visitor);
  // Setting a cookie re-renders the page in this response, in the new zone.
  await setTimeZoneCookie(timeZone);
}
// #endregion time-zone
