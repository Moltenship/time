import {
  createCanonicalRecurrenceAdapter,
  createOccurrenceExpander,
} from "@moltenship/calendar-recurrence";

import {
  fromGoogleEvents,
  readGoogleRecurrence,
  type GoogleEvent,
} from "@/content/examples/google-calendar";
import type { GoogleEventWrite } from "@/content/examples/google-calendar-api";

/** Where the fake answers, as the real API does. */
export const fakeGoogleBaseUrl = "https://www.googleapis.com/calendar/v3";

/** One request the client sent, or one thing that happened on Google's side, for the log. */
export interface FakeGoogleLogEntry {
  readonly id: number;
  /** `request` for the client's calls; `google` for changes and push notifications. */
  readonly kind: "google" | "request";
  readonly text: string;
  readonly status?: number;
  readonly note?: string;
}

export interface FakeGoogleCalendarOptions {
  /** The events on the calendar to start with. */
  readonly events: readonly GoogleEvent[];
  /** How long each answer takes, so the calendar's pending state shows. */
  readonly latencyMs?: number;
  /** At most this many events a page, so pagination shows. Google may also send fewer. */
  readonly pageSize?: number;
  /** The calendar's own time zone, which places all-day events in time. */
  readonly timeZone: string;
}

interface Page {
  readonly items: readonly GoogleEvent[];
  readonly syncToken: string;
}

const instantPattern = /(?:Z|[+-]\d{2}:\d{2})$/i;

/** Google's error body. */
function failure(status: number, reason: string, message: string) {
  return Response.json(
    { error: { code: status, errors: [{ domain: "global", message, reason }], message } },
    { status },
  );
}

/**
 * An in-memory Google Calendar API v3, behind `fetch`: the events resource's JSON, `events.list`
 * with `timeMin`/`timeMax`, pages and sync tokens, `events.instances`, and `insert`, `patch` and
 * `delete` with etags. It answers 400, 404, 409, 410, 412 and 429 as Google does. It knows one
 * calendar, `primary`, and needs no credentials.
 */
export function createFakeGoogleCalendar({
  events: initial,
  latencyMs = 0,
  pageSize = 250,
  timeZone,
}: FakeGoogleCalendarOptions) {
  /** Every event, with deleted ones kept as cancelled so sync tokens can report them. */
  const stored = new Map<string, GoogleEvent>();
  /** The version each event last changed at, for sync tokens and etags. */
  const versions = new Map<string, number>();
  const tokens = new Map<string, number>();
  const pages = new Map<string, Page>();
  let log: readonly FakeGoogleLogEntry[] = [];
  const logListeners = new Set<() => void>();
  const pushListeners = new Set<() => void>();
  let version = 0;
  let nextId = 0;
  let rateLimited = 0;

  function record(entry: Omit<FakeGoogleLogEntry, "id">) {
    // A new array each time, for `useSyncExternalStore`. The last hundred are plenty.
    log = [...log.slice(-99), { ...entry, id: nextId++ }];
    for (const listener of logListeners) listener();
  }

  function store(event: GoogleEvent) {
    version += 1;
    const saved = {
      ...event,
      etag: `"${version}"`,
      updated: Temporal.Now.instant().round("millisecond").toString(),
    };
    stored.set(event.id, saved);
    versions.set(event.id, version);
    return saved;
  }

  for (const event of initial) store(event);

  // #region times
  function instantOf(time: GoogleEvent["start"]): Temporal.Instant | null {
    if (time?.dateTime !== undefined) {
      return instantPattern.test(time.dateTime)
        ? Temporal.Instant.from(time.dateTime)
        : Temporal.PlainDateTime.from(time.dateTime)
            .toZonedDateTime(time.timeZone ?? timeZone)
            .toInstant();
    }
    if (time?.date !== undefined) {
      return Temporal.PlainDate.from(time.date).toZonedDateTime(timeZone).toInstant();
    }
    return null;
  }

  /** Whether an event belongs in a list from `timeMin` to `timeMax`, as Google filters them. */
  function inRange(event: GoogleEvent, timeMin?: Temporal.Instant, timeMax?: Temporal.Instant) {
    // Cancelled occurrences of a series show, at their original start, while `singleEvents` is
    // off. Other cancelled events don't, without `showDeleted`.
    const cancelled = event.status === "cancelled";
    if (cancelled && event.recurringEventId === undefined) return false;
    const start = instantOf(cancelled ? event.originalStartTime : event.start);
    if (start === null) return false;
    if (timeMax !== undefined && Temporal.Instant.compare(start, timeMax) >= 0) return false;
    // A series' master lists for any range after its first start: its last one may be anywhere.
    if (event.recurrence !== undefined || timeMin === undefined) return true;
    const end = cancelled ? start : instantOf(event.end);
    return end !== null && Temporal.Instant.compare(end, timeMin) > 0;
  }
  // #endregion times

  // #region instances
  /** `20261020T070000Z` for a time, `20261020` for a date, as Google's instance IDs end. */
  function instanceKey(originalStart: string) {
    return instantPattern.test(originalStart)
      ? Temporal.Instant.from(originalStart)
          .toString({ smallestUnit: "second" })
          .replace(/[-:]/g, "")
      : originalStart.replaceAll("-", "");
  }

  /**
   * The instance of a series at `originalStart`: its exception, if it has one, else the occurrence
   * the master's rule puts there. `undefined` when the rule puts none there.
   */
  function instanceOf(master: GoogleEvent, originalStart: string): GoogleEvent | undefined {
    const id = `${master.id}_${instanceKey(originalStart)}`;
    const exception = stored.get(id);
    if (exception !== undefined) return exception;

    const { events } = fromGoogleEvents([master]);
    const series = events[0];
    if (series === undefined) return undefined;
    const allDay = series.kind === "all-day";
    const key = allDay
      ? Temporal.PlainDate.from(originalStart)
      : Temporal.Instant.from(originalStart);
    const day = allDay
      ? (key as Temporal.PlainDate)
      : (key as Temporal.Instant).toZonedDateTimeISO("UTC").toPlainDate();
    const expander = createOccurrenceExpander(createCanonicalRecurrenceAdapter<GoogleEvent>());
    const occurrence = expander
      .expand(events, {
        range: { end: day.add({ days: 2 }), start: day.subtract({ days: 1 }) },
        timeZone: "UTC",
      })
      .occurrences.find((found) => found.recurrence?.recurrenceId.toString() === key.toString());
    if (occurrence === undefined) return undefined;

    const zone = master.start?.timeZone ?? timeZone;
    const time = (at: Temporal.Instant | Temporal.PlainDate | Temporal.PlainDateTime) =>
      at instanceof Temporal.PlainDate
        ? { date: at.toString() }
        : at instanceof Temporal.Instant
          ? {
              dateTime: at.toZonedDateTimeISO(zone).toString({ timeZoneName: "never" }),
              timeZone: zone,
            }
          : { dateTime: at.toString(), timeZone: zone };
    const { interval } = occurrence;
    return {
      colorId: master.colorId,
      end: time(interval.end),
      etag: master.etag,
      id,
      originalStartTime: time(interval.start),
      recurringEventId: master.id,
      start: time(interval.start),
      status: "confirmed",
      summary: master.summary,
      transparency: master.transparency,
    };
  }

  /** An instance named by Google's ID, `<series>_<original start>`. */
  function instanceById(id: string): GoogleEvent | undefined {
    const match = /^(.+)_(\d{8})(?:T(\d{2})(\d{2})(\d{2})Z)?$/.exec(id);
    if (match === null) return undefined;
    const [, seriesId, date, hour, minute, second] = match;
    const master = stored.get(seriesId!);
    if (master?.recurrence === undefined || master.status === "cancelled") return undefined;
    const day = `${date!.slice(0, 4)}-${date!.slice(4, 6)}-${date!.slice(6)}`;
    return instanceOf(master, hour === undefined ? day : `${day}T${hour}:${minute}:${second}Z`);
  }
  // #endregion instances

  // #region handlers
  function list(params: URLSearchParams): Response {
    const pageToken = params.get("pageToken");
    if (pageToken !== null) {
      const page = pages.get(pageToken);
      if (page === undefined) return failure(400, "invalid", "Invalid page token.");
      pages.delete(pageToken);
      return answer(page);
    }

    const syncToken = params.get("syncToken");
    if (syncToken !== null) {
      for (const name of ["timeMin", "timeMax", "orderBy", "q", "updatedMin", "iCalUID"]) {
        if (params.has(name))
          return failure(400, "invalid", `${name} can't be used with syncToken.`);
      }
      const since = tokens.get(syncToken);
      if (since === undefined) {
        return failure(
          410,
          "fullSyncRequired",
          "Sync token is no longer valid, a full sync is required.",
        );
      }
      const changed = [...stored.values()]
        .filter((event) => versions.get(event.id)! > since)
        .sort((a, b) => versions.get(a.id)! - versions.get(b.id)!);
      return answer({ items: changed, syncToken: newToken() });
    }

    const bounds: Partial<Record<"timeMax" | "timeMin", Temporal.Instant>> = {};
    for (const name of ["timeMin", "timeMax"] as const) {
      const value = params.get(name);
      if (value === null) continue;
      if (!instantPattern.test(value)) {
        return failure(400, "badRequest", `${name} needs a time zone offset.`);
      }
      bounds[name] = Temporal.Instant.from(value);
    }
    if (
      bounds.timeMin !== undefined &&
      bounds.timeMax !== undefined &&
      Temporal.Instant.compare(bounds.timeMin, bounds.timeMax) >= 0
    ) {
      return failure(400, "timeRangeEmpty", "The specified time range is empty.");
    }
    const items = [...stored.values()].filter((event) =>
      inRange(event, bounds.timeMin, bounds.timeMax),
    );
    return answer({ items, syncToken: newToken() });
  }

  function newToken() {
    const token = `sync-${version}-${tokens.size}`;
    tokens.set(token, version);
    return token;
  }

  /** One page, and a token for the rest, or the sync token on the last. */
  function answer({ items, syncToken }: Page): Response {
    const rest = items.slice(pageSize);
    if (rest.length === 0) {
      return Response.json({ items, kind: "calendar#events", nextSyncToken: syncToken, timeZone });
    }
    const nextPageToken = `page-${pages.size}-${nextId}`;
    pages.set(nextPageToken, { items: rest, syncToken });
    return Response.json({
      items: items.slice(0, pageSize),
      kind: "calendar#events",
      nextPageToken,
      timeZone,
    });
  }

  function instances(seriesId: string, params: URLSearchParams): Response {
    const master = stored.get(seriesId);
    if (master === undefined || master.status === "cancelled") {
      return failure(404, "notFound", "Not Found");
    }
    const originalStart = params.get("originalStart");
    if (master.recurrence === undefined || originalStart === null) {
      return failure(400, "invalid", "This fake lists one instance, by originalStart.");
    }
    const instance = instanceOf(master, originalStart);
    const shown =
      instance !== undefined &&
      (instance.status !== "cancelled" || params.get("showDeleted") === "true");
    return Response.json({ items: shown ? [instance] : [], kind: "calendar#events" });
  }

  function insert(body: GoogleEventWrite): Response {
    const id = body.id ?? `event${version}${nextId}`;
    if (!/^[a-v0-9]{5,1024}$/.test(id))
      return failure(400, "invalid", "Invalid resource id value.");
    if (stored.has(id))
      return failure(409, "duplicate", "The requested identifier already exists.");
    const event = withTimes({ id, status: "confirmed" }, body);
    if (event === undefined) return failure(400, "invalid", "The event needs a start and an end.");
    if (!validRecurrence(event)) return failure(400, "invalid", "Invalid recurrence rule.");
    return Response.json(store(event));
  }

  /** `events.patch` merges the write into the event; `events.update` replaces all of it. */
  function write(
    id: string,
    body: GoogleEventWrite,
    ifMatch: string | null,
    mode: "patch" | "update",
  ): Response {
    const current = stored.get(id) ?? instanceById(id);
    if (current === undefined) return failure(404, "notFound", "Not Found");
    const master =
      current.recurringEventId === undefined ? undefined : stored.get(current.recurringEventId);
    if (master?.status === "cancelled") {
      return failure(410, "deleted", "Resource has been deleted");
    }
    if (ifMatch !== null && ifMatch !== current.etag) {
      return failure(412, "conditionNotMet", "Precondition Failed");
    }
    // What names the event, and its place in a series, can't change.
    const { originalStartTime, recurringEventId } = current;
    const base: GoogleEvent =
      mode === "patch" ? current : { id, originalStartTime, recurringEventId, status: "confirmed" };
    const event = withTimes(base, body);
    if (event === undefined) return failure(400, "invalid", "The event needs a start and an end.");
    if (!validRecurrence(event)) return failure(400, "invalid", "Invalid recurrence rule.");
    return Response.json(store({ ...event, id, originalStartTime, recurringEventId }));
  }

  function validRecurrence(event: GoogleEvent) {
    return readGoogleRecurrence(event.recurrence ?? []).problems.length === 0;
  }

  function remove(id: string, ifMatch: string | null): Response {
    const current = stored.get(id) ?? instanceById(id);
    if (current === undefined) return failure(404, "notFound", "Not Found");
    if (current.status === "cancelled") return failure(410, "deleted", "Resource has been deleted");
    if (ifMatch !== null && ifMatch !== current.etag) {
      return failure(412, "conditionNotMet", "Precondition Failed");
    }
    cancel(current);
    // A series goes with its changed and cancelled occurrences.
    for (const event of stored.values()) {
      if (event.recurringEventId === id && event.status !== "cancelled") cancel(event);
    }
    return new Response(null, { status: 204 });
  }

  function cancel(event: GoogleEvent) {
    // What sync tokens report for a deleted event: its ID, and for an occurrence, which one.
    const { id, originalStartTime, recurringEventId } = event;
    store({ id, originalStartTime, recurringEventId, status: "cancelled" });
  }

  /** `event` with the fields of a write: `null` clears one, nested times merge field by field. */
  function withTimes(event: GoogleEvent, body: GoogleEventWrite): GoogleEvent | undefined {
    const merged: Record<string, unknown> = { ...event };
    for (const [name, value] of Object.entries(body)) {
      if (name === "start" || name === "end") {
        const time: Record<string, unknown> = { ...event[name] };
        for (const [field, part] of Object.entries(value as object)) {
          if (part === null) delete time[field];
          else time[field] = part;
        }
        merged[name] = time;
      } else if (value === null) {
        delete merged[name];
      } else if (value !== undefined) {
        merged[name] = value;
      }
    }
    const next = merged as unknown as GoogleEvent;
    const start = instantOf(next.start);
    const end = instantOf(next.end);
    const sameKind = (next.start?.date === undefined) === (next.end?.date === undefined);
    if (start === null || end === null || !sameKind || Temporal.Instant.compare(start, end) >= 0) {
      return undefined;
    }
    return next;
  }
  // #endregion handlers

  async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const prefix = `${new URL(fakeGoogleBaseUrl).pathname}/calendars/primary/events`;
    if (!url.pathname.startsWith(prefix)) return failure(404, "notFound", "Not Found");
    const [eventId, sub] = url.pathname
      .slice(prefix.length)
      .split("/")
      .filter(Boolean)
      .map(decodeURIComponent);
    const ifMatch = request.headers.get("If-Match");
    const body =
      request.method === "GET" || request.method === "DELETE" ? {} : await request.json();

    if (rateLimited > 0) {
      rateLimited -= 1;
      return Response.json(
        {
          error: {
            code: 429,
            errors: [
              {
                domain: "usageLimits",
                message: "Rate Limit Exceeded",
                reason: "rateLimitExceeded",
              },
            ],
            message: "Rate Limit Exceeded",
          },
        },
        { status: 429 },
      );
    }
    if (eventId === undefined) {
      if (request.method === "GET") return list(url.searchParams);
      if (request.method === "POST") return insert(body as GoogleEventWrite);
    } else if (sub === "instances" && request.method === "GET") {
      return instances(eventId, url.searchParams);
    } else if (sub === undefined) {
      if (request.method === "PATCH")
        return write(eventId, body as GoogleEventWrite, ifMatch, "patch");
      if (request.method === "PUT")
        return write(eventId, body as GoogleEventWrite, ifMatch, "update");
      if (request.method === "DELETE") return remove(eventId, ifMatch);
    }
    return failure(405, "methodNotAllowed", "Method Not Allowed");
  }

  /** `fetch` for the client, with the fake on the other end. */
  async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const request = new Request(input, init);
    if (latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, latencyMs));
    const response = await handle(request.clone());
    record({
      kind: "request",
      note: await noteOf(response.clone()),
      status: response.status,
      text: describe(request),
    });
    return response;
  }

  /** Runs `change` as another app would, then notifies watch channels, as Google does. */
  function changeElsewhere(
    description: string,
    change: (events: ReadonlyMap<string, GoogleEvent>) => GoogleEvent | null,
    notify: boolean,
  ) {
    const event = change(stored);
    if (event === null) return;
    if (event.status === "cancelled") cancel(event);
    else store(event);
    record({ kind: "google", text: description });
    if (!notify) return;
    setTimeout(() => {
      record({ kind: "google", text: "Push notification: X-Goog-Resource-State: exists" });
      for (const listener of pushListeners) listener();
    }, latencyMs);
  }

  return {
    changeElsewhere,
    /** Every sync token issued so far stops working, as an expired one does. */
    expireSyncTokens() {
      tokens.clear();
      record({ kind: "google", text: "Sync tokens expired" });
    },
    fetch: fakeFetch,
    getEvent: (id: string) => stored.get(id),
    getLog: () => log,
    /** The next `count` requests answer 429 Rate Limit Exceeded. */
    rateLimitNext(count: number) {
      rateLimited += count;
      record({ kind: "google", text: `The next ${count} requests are rate-limited` });
    },
    subscribeToLog: (listener: () => void) => {
      logListeners.add(listener);
      return () => {
        logListeners.delete(listener);
      };
    },
    /** Like an `events.watch` channel: called after each change made elsewhere. */
    watch(listener: () => void) {
      pushListeners.add(listener);
      return () => {
        pushListeners.delete(listener);
      };
    },
  };
}

export type FakeGoogleCalendar = ReturnType<typeof createFakeGoogleCalendar>;

/** A request as the log shows it: method, path below the calendar, and query. */
function describe(request: Request): string {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^.*\/calendars\/[^/]+\//, "");
  const query = [...url.searchParams]
    .map(([name, value]) => `${name}=${name.endsWith("Token") ? `${value.slice(0, 10)}…` : value}`)
    .join("&");
  const ifMatch = request.headers.get("If-Match");
  return `${request.method} ${path}${query === "" ? "" : `?${query}`}${ifMatch === null ? "" : ` If-Match: ${ifMatch}`}`;
}

async function noteOf(response: Response): Promise<string | undefined> {
  if (response.status === 204) return undefined;
  const body = (await response.json()) as {
    error?: { errors?: { reason?: string }[] };
    items?: unknown[];
    nextPageToken?: string;
    nextSyncToken?: string;
  };
  if (body.error !== undefined) return body.error.errors?.[0]?.reason;
  if (body.items === undefined) return undefined;
  const count = `${body.items.length} ${body.items.length === 1 ? "event" : "events"}`;
  if (body.nextPageToken !== undefined) return `${count}, next page`;
  if (body.nextSyncToken !== undefined) return `${count}, sync token`;
  return count;
}
