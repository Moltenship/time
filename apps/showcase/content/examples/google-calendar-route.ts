// #region route
// app/api/google-calendar/[...path]/route.ts
import type { NextRequest } from "next/server";

/**
 * The signed-in user's Google access token, from your auth library, with the
 * `https://www.googleapis.com/auth/calendar.events` scope. `null` when they aren't signed in.
 */
declare function googleAccessToken(request: NextRequest): Promise<string | null>;

const calendarApi = "https://www.googleapis.com/calendar/v3";

/** The query parameters the client sends. */
const parameters = new Set([
  "originalStart",
  "pageToken",
  "showDeleted",
  "syncToken",
  "timeMax",
  "timeMin",
]);

/** Which calls go through: the methods each path takes, below `calendars/primary/events`. */
function allowed(method: string, event: readonly string[]): boolean {
  const [id, instances, ...rest] = event;
  if (id === undefined) return method === "GET" || method === "POST"; // list, insert
  if (id === "." || id === ".." || rest.length > 0) return false;
  if (instances !== undefined) return instances === "instances" && method === "GET";
  return method === "PATCH" || method === "PUT" || method === "DELETE";
}

/**
 * Sends the browser's Calendar API requests on to Google with the user's access token, which never
 * reaches the browser. Only the calls the client makes, on the user's own events.
 */
async function forward(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  // Only your own pages: browsers mark a request from another site.
  if (request.headers.get("Sec-Fetch-Site") === "cross-site") {
    return Response.json({ error: { code: 403, message: "Forbidden" } }, { status: 403 });
  }
  const { path } = await params;
  const [calendars, calendarId, events, ...event] = path;
  const { searchParams } = request.nextUrl;
  if (
    calendars !== "calendars" ||
    calendarId !== "primary" ||
    events !== "events" ||
    !allowed(request.method, event) ||
    [...searchParams.keys()].some((name) => !parameters.has(name))
  ) {
    return Response.json({ error: { code: 404, message: "Not found" } }, { status: 404 });
  }

  const token = await googleAccessToken(request);
  if (token === null) {
    return Response.json({ error: { code: 401, message: "Sign in again" } }, { status: 401 });
  }

  const url = new URL(`${calendarApi}/${path.map(encodeURIComponent).join("/")}`);
  url.search = searchParams.toString();
  const headers = new Headers({ Authorization: `Bearer ${token}` });
  for (const name of ["Content-Type", "If-Match"]) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  const response = await fetch(url, {
    body: request.method === "GET" || request.method === "DELETE" ? null : await request.text(),
    headers,
    method: request.method,
  });

  // The status, Retry-After and Google's error body pass through, so the browser handles 410, 412
  // and 429 itself.
  const passed = new Headers();
  for (const name of ["Content-Type", "Retry-After"]) {
    const value = response.headers.get(name);
    if (value !== null) passed.set(name, value);
  }
  return new Response(response.body, { headers: passed, status: response.status });
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const PUT = forward;
export const DELETE = forward;
// #endregion route
