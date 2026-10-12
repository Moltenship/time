// #region client
// lib/google-calendar-api.ts
import type { GoogleEvent } from "./google-calendar";

export interface GoogleCalendarApiOptions {
  /**
   * `https://www.googleapis.com/calendar/v3` on your server, with `headers` adding the user's
   * access token. In the browser, your own route that adds it.
   */
  readonly baseUrl: string;
  /** "primary", or a calendar's ID from `calendarList.list`. */
  readonly calendarId?: string;
  readonly fetch?: typeof fetch;
  /** Headers for every request, such as `Authorization: Bearer <access token>`. */
  readonly headers?: () => HeadersInit | Promise<HeadersInit>;
  /** How often to retry a rate-limited or failed request before giving up. */
  readonly retries?: number;
  /** How long to wait before retry `attempt`, from 0, when Google doesn't say. */
  readonly retryDelay?: (attempt: number) => number;
}

/** A request Google refused: its status, and the reason its error body gives. */
export class GoogleApiError extends Error {
  override readonly name = "GoogleApiError";
  readonly reason: string | undefined;
  readonly status: number;

  constructor(status: number, reason: string | undefined, message: string) {
    super(message);
    this.reason = reason;
    this.status = status;
  }
}

/**
 * The events that end after `timeMin` and start before `timeMax`, if given, or the changes since a
 * sync token. Google doesn't take both at once.
 */
export type GoogleEventsQuery =
  | { readonly timeMax?: Temporal.Instant; readonly timeMin: Temporal.Instant }
  | { readonly syncToken: string };

export interface GoogleEventTimeWrite {
  readonly date?: string | null;
  readonly dateTime?: string | null;
  readonly timeZone?: string | null;
}

/**
 * What a write sends: these fields, and any other of the Event resource. In a patch, `null` clears a
 * field, as a move between all-day and timed needs.
 */
export interface GoogleEventWrite {
  readonly colorId?: string;
  readonly end?: GoogleEventTimeWrite;
  /** Insert only: lowercase a–v and digits, 5 to 1024 of them, so you can pick it up front. */
  readonly id?: string;
  readonly originalStartTime?: GoogleEventTimeWrite;
  readonly recurrence?: readonly string[];
  readonly recurringEventId?: string;
  readonly start?: GoogleEventTimeWrite;
  readonly status?: "confirmed" | "tentative";
  readonly summary?: string;
  readonly transparency?: "opaque" | "transparent";
}

interface GoogleEventsPage {
  readonly items?: readonly GoogleEvent[];
  readonly nextPageToken?: string;
  readonly nextSyncToken?: string;
}

const rateLimits = new Set(["rateLimitExceeded", "userRateLimitExceeded"]);

/** 1, 2, 4… seconds, up to 32, plus up to a second at random, so clients don't retry in step. */
const backoff = (attempt: number) => Math.min(2 ** attempt, 32) * 1000 + Math.random() * 1000;

/** The Calendar API's events, over `fetch`. */
export function createGoogleCalendarApi({
  baseUrl,
  calendarId = "primary",
  fetch: send = fetch,
  headers,
  retries = 5,
  retryDelay = backoff,
}: GoogleCalendarApiOptions) {
  const events = `${baseUrl}/calendars/${encodeURIComponent(calendarId)}/events`;

  async function request<T>(
    method: "DELETE" | "GET" | "PATCH" | "POST" | "PUT",
    url: string,
    { body, etag }: { readonly body?: GoogleEventWrite; readonly etag?: string | undefined } = {},
  ): Promise<T> {
    const sent = new Headers(await headers?.());
    if (body !== undefined) sent.set("Content-Type", "application/json");
    // Google writes only over the version you read, and answers 412 if it has changed since.
    if (etag !== undefined) sent.set("If-Match", etag);

    for (let attempt = 0; ; attempt++) {
      const response = await send(url, {
        body: body === undefined ? null : JSON.stringify(body),
        headers: sent,
        method,
      });
      if (response.ok) return (response.status === 204 ? undefined : await response.json()) as T;

      const error = await errorOf(response);
      const rateLimited =
        error.status === 429 || (error.status === 403 && rateLimits.has(error.reason ?? ""));
      if (attempt >= retries || !(rateLimited || error.status >= 500)) throw error;
      const retryAfter = Number(response.headers.get("Retry-After"));
      await sleep(retryAfter > 0 ? retryAfter * 1000 : retryDelay(attempt));
    }
  }

  return {
    /**
     * Every page of `events.list`. Series come as their masters, with their changed and cancelled
     * occurrences, since `singleEvents` stays off. The sync token is on the last page.
     */
    async list(query: GoogleEventsQuery) {
      const items: GoogleEvent[] = [];
      let pageToken: string | undefined;
      for (;;) {
        const params = new URLSearchParams(
          "syncToken" in query
            ? { syncToken: query.syncToken }
            : { timeMin: query.timeMin.toString() },
        );
        if ("timeMax" in query && query.timeMax !== undefined) {
          params.set("timeMax", query.timeMax.toString());
        }
        if (pageToken !== undefined) params.set("pageToken", pageToken);
        const page = await request<GoogleEventsPage>("GET", `${events}?${params}`);
        items.push(...(page.items ?? []));
        pageToken = page.nextPageToken;
        if (pageToken === undefined) return { items, nextSyncToken: page.nextSyncToken };
      }
    },

    /**
     * The occurrence a series' rule puts at `originalStart`, with its own ID and etag, cancelled
     * or not.
     */
    async instance(seriesId: string, originalStart: string) {
      const params = new URLSearchParams({ originalStart, showDeleted: "true" });
      for (;;) {
        const page = await request<GoogleEventsPage>(
          "GET",
          `${events}/${encodeURIComponent(seriesId)}/instances?${params}`,
        );
        const [instance] = page.items ?? [];
        if (instance !== undefined) return instance;
        // A page may be empty and still have more.
        if (page.nextPageToken === undefined) break;
        params.set("pageToken", page.nextPageToken);
      }
      throw new GoogleApiError(
        404,
        "notFound",
        `${seriesId} has no occurrence at ${originalStart}`,
      );
    },

    insert: (event: GoogleEventWrite) => request<GoogleEvent>("POST", events, { body: event }),

    patch: (id: string, fields: GoogleEventWrite, etag: string | undefined) =>
      request<GoogleEvent>("PATCH", `${events}/${encodeURIComponent(id)}`, { body: fields, etag }),

    remove: (id: string, etag: string | undefined) =>
      request<void>("DELETE", `${events}/${encodeURIComponent(id)}`, { etag }),

    /** Replaces the whole event: a field the write leaves out is cleared. */
    update: (id: string, event: GoogleEventWrite, etag: string | undefined) =>
      request<GoogleEvent>("PUT", `${events}/${encodeURIComponent(id)}`, { body: event, etag }),
  };
}

export type GoogleCalendarApi = ReturnType<typeof createGoogleCalendarApi>;

/** Google's error body: `{ error: { code, message, errors: [{ reason }] } }`. */
async function errorOf(response: Response): Promise<GoogleApiError> {
  const body = (await response.json().catch(() => undefined)) as
    | { error?: { errors?: { reason?: string }[]; message?: string } }
    | undefined;
  return new GoogleApiError(
    response.status,
    body?.error?.errors?.[0]?.reason,
    body?.error?.message ?? response.statusText,
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// #endregion client
