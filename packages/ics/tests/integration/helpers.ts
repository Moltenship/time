import { readdirSync, readFileSync } from "node:fs";

import type {
  IcsAttendee,
  IcsCalendar,
  IcsComponent,
  IcsDateValue,
  IcsEvent,
  IcsExtensionsConfig,
  IcsIssue,
  IcsProperty,
  StandardSchemaV1,
} from "../../src/index";

const fixturesDirectory = new URL("../fixtures/", import.meta.url);

/** Every `.ics` file in the fixture corpus. */
export const fixtureNames: readonly string[] = readdirSync(fixturesDirectory)
  .filter((name) => name.endsWith(".ics"))
  .sort();

/** A fixture's text, byte for byte: a BOM and bare LFs are kept. */
export function readFixture(name: string): string {
  return readFileSync(new URL(name, fixturesDirectory), "utf8");
}

/** The 1-based number of the first physical line that equals `line`, at or after line `from`. */
export function lineOf(text: string, line: string, from = 1): number {
  const lines = text.split(/\r\n|\n|\r/);
  const index = lines.indexOf(line, from - 1);
  if (index < 0) throw new Error(`fixture has no line ${JSON.stringify(line)}`);
  return index + 1;
}

/** The 1-based number of the last physical line that equals `line`, before line `before`. */
export function lineBefore(text: string, line: string, before: number): number {
  const lines = text.split(/\r\n|\n|\r/);
  const index = lines.lastIndexOf(line, before - 2);
  if (index < 0) throw new Error(`fixture has no line ${JSON.stringify(line)} before ${before}`);
  return index + 1;
}

/** Runs `compute` on first use, so a throwing stub fails each test rather than the whole file. */
export function once<T>(compute: () => T): () => T {
  let cached: { readonly value: T } | undefined;
  return () => (cached ??= { value: compute() }).value;
}

/** Joins content lines with CRLF, for small inline calendars. */
export function ics(...lines: readonly string[]): string {
  return `${lines.join("\r\n")}\r\n`;
}

type TemporalValue =
  | Temporal.Duration
  | Temporal.Instant
  | Temporal.PlainDate
  | Temporal.PlainDateTime
  | Temporal.PlainTime
  | Temporal.ZonedDateTime;

function isTemporal(value: object): value is TemporalValue {
  return Object.prototype.toString.call(value).startsWith("[object Temporal.");
}

/**
 * A deep copy with every Temporal object replaced by its `toString()`, so `toEqual` compares
 * Temporal values by content (two different `Temporal.Instant`s are otherwise "equal").
 */
export function plain(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;
  if (isTemporal(value)) return value.toString();
  if (Array.isArray(value)) return value.map(plain);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]));
}

/**
 * A compact description of a DATE / DATE-TIME value: its kind, then what identifies it.
 * `zoned` shows the ZonedDateTime (wall time, offset and resolved zone) and the TZID as written.
 */
export function describeDate(value: IcsDateValue | undefined): string {
  if (value === undefined) return "undefined";
  switch (value.kind) {
    case "date":
      return `date ${value.date.toString()}`;
    case "floating":
      return `floating ${value.wallTime.toString()}`;
    case "unresolved":
      return `unresolved ${value.wallTime.toString()} ${value.tzid}`;
    case "utc":
      return `utc ${value.instant.toString()}`;
    case "zoned":
      return `zoned ${value.zoned.toString()} tzid=${value.tzid}`;
  }
}

/** The instant of a `utc` or `zoned` value, as an ISO string. */
export function instantOf(value: IcsDateValue | undefined): string {
  if (value?.kind === "utc") return value.instant.toString();
  if (value?.kind === "zoned") return value.zoned.toInstant().toString();
  throw new Error(`not an absolute date-time: ${describeDate(value)}`);
}

/** The only calendar of a result, failing loudly when there isn't exactly one. */
export function onlyCalendar<T extends IcsExtensionsConfig>(result: {
  readonly calendars: readonly IcsCalendar<T>[];
}): IcsCalendar<T> {
  if (result.calendars.length !== 1) {
    throw new Error(`expected one calendar, got ${result.calendars.length}`);
  }
  return result.calendars[0] as IcsCalendar<T>;
}

/** The event with this UID (and RECURRENCE-ID wall time or date, when given). */
export function eventByUid<T extends IcsEvent<IcsExtensionsConfig>>(
  events: readonly T[],
  uid: string,
  recurrenceId?: string,
): T {
  const found = events.filter(
    (event) =>
      event.uid === uid &&
      (recurrenceId === undefined
        ? event.recurrenceId === undefined
        : recurrenceIdText(event.recurrenceId) === recurrenceId),
  );
  if (found.length !== 1) {
    throw new Error(`expected one event ${uid} ${recurrenceId ?? ""}, got ${found.length}`);
  }
  return found[0] as T;
}

function recurrenceIdText(value: IcsDateValue | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value.kind === "date") return value.date.toString();
  if (value.kind === "utc") return value.instant.toString();
  return value.wallTime.toString();
}

/** The first property with this name. */
export function propertyNamed(
  properties: readonly IcsProperty[],
  name: string,
): IcsProperty | undefined {
  return properties.find((property) => property.name === name);
}

/** Names of the properties, in order. */
export function propertyNames(properties: readonly IcsProperty[]): readonly string[] {
  return properties.map((property) => property.name);
}

/** The component tree without `line` fields, for comparing trees parsed from different text. */
export function withoutLines(components: readonly IcsComponent[]): unknown {
  return components.map((component) => ({
    components: withoutLines(component.components),
    name: component.name,
    properties: component.properties.map(({ name, parameters, value }) => ({
      name,
      parameters,
      value,
    })),
  }));
}

/**
 * Attendees without `rsvp`. Where RSVP isn't written, the contract doesn't say whether `rsvp` is
 * absent or RFC 5545's default `false`, so tests compare it with `rsvpOf` instead.
 */
export function withoutRsvp(attendees: readonly IcsAttendee[]): readonly unknown[] {
  return attendees.map(({ rsvp: _rsvp, ...attendee }) => attendee);
}

/** Whether each attendee asked for a reply (`RSVP=TRUE`). */
export function rsvpOf(attendees: readonly IcsAttendee[]): readonly boolean[] {
  return attendees.map(({ rsvp }) => rsvp === true);
}

export function errorsOf(issues: readonly IcsIssue[]): readonly IcsIssue[] {
  return issues.filter((issue) => issue.severity === "error");
}

// ── Hand-written Standard Schemas (the package has no dependencies, so no Zod here) ───────────

type Validate<Output> = (
  value: unknown,
) => StandardSchemaV1.Result<Output> | Promise<StandardSchemaV1.Result<Output>>;

/** A minimal Standard Schema V1 implementation. */
export function defineSchema<Input, Output>(
  validate: Validate<Output>,
): StandardSchemaV1<Input, Output> {
  return { "~standard": { validate, vendor: "ics-tests", version: 1 } };
}

/** Accepts one of `values`; fails with `not one of …` otherwise. */
export function enumSchema<const T extends string>(
  values: readonly T[],
): StandardSchemaV1<string, T> {
  return defineSchema<string, T>((value) =>
    typeof value === "string" && (values as readonly string[]).includes(value)
      ? { value: value as T }
      : { issues: [{ message: `not one of ${values.join(", ")}: ${String(value)}` }] },
  );
}

/** Takes the decoded INTEGER and wraps it: proves the schema sees a number and can transform. */
export const idSchema = defineSchema<number, { readonly id: number }>((value) =>
  typeof value === "number" && Number.isInteger(value)
    ? { value: { id: value } }
    : { issues: [{ message: `expected an integer, got ${typeof value}` }] },
);

/** Validates asynchronously, which an extension schema must not do. */
export const promiseSchema = defineSchema<string, string>((value) =>
  Promise.resolve({ value: String(value) }),
);
