import type {
  CalendarEnvironmentBase,
  CalendarEventPlacement,
  CalendarEventPlacementInput,
  EventId,
  EventSnapshot,
  NormalizedCalendarEvent,
  ResourceId,
} from "@moltenship/calendar-core";
import {
  instantInterval,
  plainDateTimeInterval,
  type PlainDateInterval,
} from "@moltenship/calendar-temporal";

import type { AnyCalendarViewDefinition, CalendarActiveView } from "./views";

/**
 * Argument parsing for the calendar's agent surface. An agent sends JSON, so dates and times
 * arrive as ISO strings; each parser accepts the Temporal value too, for code that calls the
 * same methods, and throws an error that says what it expected, which the agent reads.
 */

type AnyEvent = NormalizedCalendarEvent<unknown, EventId, ResourceId>;
export type AnyEvents = EventSnapshot<unknown, EventId, ResourceId>;

/** One visible event, as an agent's `query` lists it: its ID as a string, its title and time. */
export interface CalendarAgentItem {
  readonly label: string;
  readonly value: string;
}

/**
 * An event as an agent reads it, in JSON an agent can compute with. Times are ISO 8601: a timed
 * event's with the offset of the calendar's time zone, as `"2026-03-14T09:00:00+01:00"`; an all-day
 * event's as dates; a floating event's as wall-clock date-times without an offset. `end` is
 * exclusive, as everywhere in the calendar.
 */
export interface CalendarAgentEvent {
  readonly end: string;
  /** The ID as the event adapter gives it, a string or a number. */
  readonly id: EventId;
  readonly kind: "all-day" | "floating" | "timed";
  /** Set while a change to the event is still being decided or saved. */
  readonly pending?: true;
  /** Set when the event can't be changed. */
  readonly readOnly?: true;
  readonly resourceIds: readonly ResourceId[];
  readonly start: string;
  readonly title: string;
}

function describe(value: unknown): string {
  return typeof value === "string" ? `"${value}"` : (JSON.stringify(value) ?? String(value));
}

/** A date as `YYYY-MM-DD`; a date-time's date counts too. */
const calendarAnnotation = /\[!?u-ca=([^\]]*)\]/iu;

/**
 * Refuses a date in another calendar than ISO 8601, as `2026-08-20[u-ca=hebrew]` gives: Temporal
 * would carry that calendar into state and proposals, where everything else is ISO, and its
 * month and day would mean something else to every reader.
 */
function refuseOtherCalendars(value: unknown, name: string): void {
  const calendar =
    typeof value === "string"
      ? calendarAnnotation.exec(value)?.[1]
      : value instanceof Temporal.PlainDate ||
          value instanceof Temporal.PlainDateTime ||
          value instanceof Temporal.ZonedDateTime
        ? value.calendarId
        : undefined;
  if (calendar === undefined || calendar.toLowerCase() === "iso8601") return;
  throw new RangeError(
    `calendar-agent-unsupported-calendar: ${name} is in the ${JSON.stringify(calendar)} calendar, in ${describe(value)}; the calendar takes ISO 8601 dates only, without a [u-ca=…] annotation`,
  );
}

export function parsePlainDate(value: unknown, name: string): Temporal.PlainDate {
  refuseOtherCalendars(value, name);
  if (value instanceof Temporal.PlainDate) return value;
  if (typeof value === "string") {
    try {
      return Temporal.PlainDate.from(value);
    } catch {
      // Reported below, with what was expected.
    }
  }
  throw new TypeError(
    `calendar-agent-invalid-date: ${name} must be an ISO date such as "2026-03-14", not ${describe(value)}`,
  );
}

/** A time zone as an IANA name, checked against the platform's database. */
export function parseTimeZone(value: unknown): string {
  if (typeof value === "string") {
    try {
      return Temporal.ZonedDateTime.from({ day: 1, month: 1, timeZone: value, year: 2000 })
        .timeZoneId;
    } catch {
      // Reported below.
    }
  }
  throw new TypeError(
    `calendar-agent-invalid-time-zone: expected an IANA time zone such as "Europe/Berlin", not ${describe(value)}`,
  );
}

const offsetOrZone = /(?:[zZ]|[+-]\d{2}(?::?\d{2})?)(?:\[[^\]]+\])?$|\[[^\]]+\]$/u;

/**
 * An exact time: with an offset or `Z` it means that instant, as `2026-03-14T09:00Z`; without
 * one it is wall-clock time in the display time zone, as `2026-03-14T09:00`.
 */
export function parseInstant(
  value: unknown,
  name: string,
  environment: Pick<CalendarEnvironmentBase, "disambiguation" | "timeZone">,
): Temporal.Instant {
  refuseOtherCalendars(value, name);
  if (value instanceof Temporal.Instant) return value;
  if (value instanceof Temporal.ZonedDateTime) return value.toInstant();
  if (typeof value === "string") {
    try {
      // An ISO calendar annotation names no zone, so it doesn't make the time exact.
      const iso = value.replace(calendarAnnotation, "");
      if (offsetOrZone.test(iso)) {
        return iso.includes("[")
          ? Temporal.ZonedDateTime.from(iso).toInstant()
          : Temporal.Instant.from(iso);
      }
      return Temporal.PlainDateTime.from(iso)
        .toZonedDateTime(environment.timeZone, { disambiguation: environment.disambiguation })
        .toInstant();
    } catch {
      // Reported below.
    }
  }
  throw new TypeError(
    `calendar-agent-invalid-time: ${name} must be an ISO date-time such as "2026-03-14T09:00" (in the calendar's time zone, ${environment.timeZone}) or "2026-03-14T09:00Z", not ${describe(value)}`,
  );
}

/** A wall-clock date-time, for floating events. */
export function parsePlainDateTime(value: unknown, name: string): Temporal.PlainDateTime {
  refuseOtherCalendars(value, name);
  if (value instanceof Temporal.PlainDateTime) return value;
  if (typeof value === "string") {
    try {
      return Temporal.PlainDateTime.from(value);
    } catch {
      // Reported below.
    }
  }
  throw new TypeError(
    `calendar-agent-invalid-time: ${name} must be an ISO date-time such as "2026-03-14T09:00", not ${describe(value)}`,
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

/**
 * An action's one JSON object argument, checked against the keys it takes: `true` for a required
 * key, `false` for an optional one. Anything else, a second argument, an unknown key or a missing
 * one, fails with the action's signature, so the agent can retry with what it expected.
 */
export function readAgentInput<TKey extends string>(
  action: string,
  signature: string,
  input: unknown,
  keys: Readonly<Record<TKey, boolean>>,
  extra: readonly unknown[] = [],
  nullable: readonly TKey[] = [],
): Readonly<Partial<Record<TKey, unknown>>> {
  const fail = (problem: string): never => {
    throw new TypeError(
      `calendar-agent-invalid-arguments: ${action} takes ${signature}; ${problem}`,
    );
  };
  if (extra.some((value) => value !== undefined)) {
    fail(`it takes one object, not ${extra.length + 1} arguments`);
  }
  if (!isRecord(input)) fail(`got ${describe(input)}`);
  const record = input as Readonly<Record<string, unknown>>;
  const known: Readonly<Record<string, boolean>> = keys;
  const unknown = Object.keys(record).filter((key) => !Object.hasOwn(known, key));
  if (unknown.length > 0) {
    fail(`it has no ${unknown.map((key) => JSON.stringify(key)).join(", ")}`);
  }
  for (const [key, required] of Object.entries(known)) {
    const value = record[key];
    if (value === null && !(nullable as readonly string[]).includes(key)) {
      fail(`${key} can't be null`);
    }
    if (required && value === undefined) fail(`${key} is missing`);
  }
  return record as Readonly<Partial<Record<TKey, unknown>>>;
}

/** An event's ID as the adapter gives it: a string or a number. */
export function readEventId(value: unknown): EventId {
  if (typeof value === "string" || (typeof value === "number" && Number.isFinite(value))) {
    return value;
  }
  throw new TypeError(
    `calendar-agent-invalid-arguments: eventId must be an event's ID, a string or a number from listEvents, not ${describe(value)}`,
  );
}

/** A list of resource IDs, each a string or a number. */
export function readResourceIds(
  value: unknown,
  known: ReadonlyMap<ResourceId, unknown>,
): readonly ResourceId[] {
  if (
    !Array.isArray(value) ||
    !value.every((id) => typeof id === "string" || typeof id === "number")
  ) {
    throw new TypeError(
      `calendar-agent-invalid-resources: resourceIds must be a list of resource IDs, not ${describe(value)}`,
    );
  }
  // A calendar without resources has none to check against: its events may name the
  // application's own.
  if (known.size === 0) return Object.freeze([...(value as readonly ResourceId[])]);
  return Object.freeze(
    (value as readonly ResourceId[]).map((id) => {
      if (known.has(id)) return id;
      // JSON gives a number as a string and back, as event IDs may come.
      const found = [...known.keys()].find((candidate) => String(candidate) === String(id));
      if (found !== undefined) return found;
      const listed = [...known.keys()].slice(0, 20).map((candidate) => JSON.stringify(candidate));
      throw new RangeError(
        `calendar-agent-unknown-resource: no resource has the ID ${describe(id)}. Resources: ${listed.join(", ")}${
          known.size > listed.length ? ", …" : ""
        }`,
      );
    }),
  );
}

/**
 * The fields an agent gives beside a placement: its `fields` object with its `title` in it. Not
 * validated further: what a field means is the application's to decide.
 */
export function readFields(input: {
  readonly fields?: unknown;
  readonly title?: unknown;
}): Readonly<Record<string, unknown>> | undefined {
  const { fields, title } = input;
  if (title !== undefined && typeof title !== "string") {
    throw new TypeError(
      `calendar-agent-invalid-arguments: title must be a string, not ${describe(title)}`,
    );
  }
  if (fields !== undefined && !isRecord(fields)) {
    throw new TypeError(
      `calendar-agent-invalid-arguments: fields must be an object of JSON values, not ${describe(fields)}`,
    );
  }
  if (title !== undefined && fields !== undefined && Object.hasOwn(fields, "title")) {
    throw new TypeError(
      "calendar-agent-invalid-arguments: give the title as title or as fields.title, not both",
    );
  }
  if (fields === undefined && title === undefined) return undefined;
  return Object.freeze({ ...fields, ...(title === undefined ? {} : { title }) });
}

function hasTime(value: unknown): boolean {
  return typeof value === "string"
    ? value.includes("T") || value.includes("t")
    : !(value instanceof Temporal.PlainDate);
}

/** The event an agent names, by its ID as the adapter gives it or as a string. */
export function findEvent(events: AnyEvents, id: unknown): AnyEvent {
  const exact = typeof id === "string" || typeof id === "number" ? events.get(id) : undefined;
  if (exact !== undefined) return exact;
  const found = events.events.find((event) => String(event.id) === String(id));
  if (found !== undefined) return found;
  const known = events.events.slice(0, 20).map((event) => JSON.stringify(event.id));
  throw new RangeError(
    `calendar-agent-unknown-event: no event has the ID ${describe(id)}. Events: ${
      known.length === 0 ? "none" : known.join(", ")
    }${events.size > known.length ? ", …" : ""}`,
  );
}

/** Where `event` would land when it starts at `start`, keeping its length unless `end` is given. */
export function movedPlacement(
  event: AnyEvent,
  start: unknown,
  end: unknown,
  environment: CalendarEnvironmentBase,
): CalendarEventPlacementInput {
  if (event.kind === "all-day") {
    const from = parsePlainDate(start, "start");
    const to =
      end === undefined ? from.add(event.start.until(event.end)) : parsePlainDate(end, "end");
    return { end: to, kind: "all-day", start: from };
  }
  if (event.kind === "floating") {
    const from = parsePlainDateTime(start, "start");
    const to =
      end === undefined ? from.add(event.start.until(event.end)) : parsePlainDateTime(end, "end");
    return { end: to, kind: "floating", start: from };
  }
  const from = parseInstant(start, "start", environment);
  const to =
    end === undefined
      ? from.add(event.start.until(event.end))
      : parseInstant(end, "end", environment);
  return {
    end: to,
    kind: "timed",
    start: from,
    ...(event.sourceTimeZone === undefined ? {} : { sourceTimeZone: event.sourceTimeZone }),
  };
}

/** Where `event` would land with its end at `end`. */
export function resizedPlacement(
  event: AnyEvent,
  end: unknown,
  environment: CalendarEnvironmentBase,
): CalendarEventPlacementInput {
  return movedPlacement(event, event.start, end, environment);
}

/** A new event's placement: dates make an all-day event, date-times a timed one. */
export function createdPlacement(
  start: unknown,
  end: unknown,
  resourceIds: unknown,
  environment: CalendarEnvironmentBase,
  resources: ReadonlyMap<ResourceId, unknown>,
): CalendarEventPlacementInput {
  const withResources =
    resourceIds === undefined ? {} : { resourceIds: readResourceIds(resourceIds, resources) };
  if (!hasTime(start) && !hasTime(end)) {
    return {
      end: parsePlainDate(end, "end"),
      kind: "all-day",
      start: parsePlainDate(start, "start"),
      ...withResources,
    };
  }
  return {
    end: parseInstant(end, "end", environment),
    kind: "timed",
    start: parseInstant(start, "start", environment),
    ...withResources,
  };
}

/** The events that overlap `range` in the calendar's time zone, all-day ones first, then by start. */
export function eventsInRange(
  events: AnyEvents,
  range: PlainDateInterval,
  environment: CalendarEnvironmentBase,
): readonly AnyEvent[] {
  const startOfDay = (date: Temporal.PlainDate) =>
    date.toZonedDateTime({ timeZone: environment.timeZone }).toInstant();
  const instants = instantInterval(startOfDay(range.start), startOfDay(range.end));
  const floating = plainDateTimeInterval(
    range.start.toPlainDateTime(),
    range.end.toPlainDateTime(),
  );
  const timed = [...events.queryTimed(instants), ...events.queryFloating(floating)];
  timed.sort((left, right) =>
    Temporal.Instant.compare(startOf(left, environment), startOf(right, environment)),
  );
  return [...events.queryAllDay(range), ...timed];
}

/** The events the active view shows, in the order a reader meets them: all-day ones first. */
export function visibleEventsOf(
  events: AnyEvents,
  view: CalendarActiveView<AnyCalendarViewDefinition> | null,
): readonly AnyEvent[] {
  if (view === null) return [];
  const { instantRange, range } = view;
  const floating = plainDateTimeInterval(
    range.start.toPlainDateTime(),
    range.end.toPlainDateTime(),
  );
  const timed = [...events.queryTimed(instantRange), ...events.queryFloating(floating)];
  timed.sort((left, right) =>
    Temporal.Instant.compare(startOf(left, view.environment), startOf(right, view.environment)),
  );
  return [...events.queryAllDay(range), ...timed];
}

function startOf(event: AnyEvent, environment: CalendarEnvironmentBase): Temporal.Instant {
  return event.kind === "timed"
    ? event.start
    : event.start.toZonedDateTime(environment.timeZone).toInstant();
}

/** Where an event is or would be, in `listEvents`' terms. */
export type CalendarAgentPlacement = Pick<
  CalendarAgentEvent,
  "end" | "kind" | "resourceIds" | "start"
>;

/** A placement as JSON, with its times in `timeZone`. */
export function describeAgentPlacement(
  placement: CalendarEventPlacement,
  timeZone: string,
): CalendarAgentPlacement {
  const timed = (instant: Temporal.Instant) =>
    instant.toZonedDateTimeISO(timeZone).toString({ timeZoneName: "never" });
  const [start, end] =
    placement.kind === "timed"
      ? [timed(placement.start), timed(placement.end)]
      : [placement.start.toString(), placement.end.toString()];
  return Object.freeze({ end, kind: placement.kind, resourceIds: placement.resourceIds, start });
}

/** An event as JSON, with its times in the calendar's time zone. */
export function describeAgentEvent(
  event: AnyEvent,
  environment: Pick<CalendarEnvironmentBase, "timeZone">,
): CalendarAgentEvent {
  return Object.freeze({
    ...describeAgentPlacement(event, environment.timeZone),
    id: event.id,
    ...(event.isPending === true ? { pending: true as const } : {}),
    ...(event.isReadOnly ? { readOnly: true as const } : {}),
    title: event.title,
  });
}

/** `2026-03-14T09:00:00+01:00` as `2026-03-14T09:00`, for a label a person can read too. */
function minutes(value: string): string {
  return value.slice(0, 16);
}

/**
 * An event's default label for an agent: its title, then when it happens in ISO 8601, in the
 * calendar's time zone, as `Design review · 2026-03-14T09:00 to 2026-03-14T10:00 (Europe/Berlin)`.
 * Unlike a localized date, an agent can read it back exactly. An all-day event's last day is
 * inclusive here, as a person reads `to`; `listEvents` gives the exclusive end.
 */
export function agentEventLabel(event: CalendarAgentEvent, timeZone: string): string {
  let when: string;
  if (event.kind === "all-day") {
    const last = Temporal.PlainDate.from(event.end).subtract({ days: 1 }).toString();
    when =
      last === event.start ? `${event.start} (all day)` : `${event.start} to ${last} (all day)`;
  } else {
    const zone = event.kind === "timed" ? timeZone : "local time";
    when = `${minutes(event.start)} to ${minutes(event.end)} (${zone})`;
  }
  return event.title === "" ? when : `${event.title} · ${when}`;
}

/** `agentEventLabel` of a normalized event, in the calendar's time zone. */
export function eventLabel(event: AnyEvent, environment: CalendarEnvironmentBase): string {
  return agentEventLabel(describeAgentEvent(event, environment), environment.timeZone);
}
