import { expect } from "vite-plus/test";

import type {
  IcsCalendar,
  IcsEvent,
  IcsExtensionsConfig,
  IcsIssue,
  IcsParseOptions,
  IcsParseResult,
  StandardSchemaV1,
} from "../../src/index";
import { parseIcs } from "../../src/index";

/**
 * A deep copy with every Temporal object replaced by its `toString()`: `toEqual` would call any two
 * Temporal objects of a type equal, since they have no own properties.
 */
export function plain(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;
  if (Object.prototype.toString.call(value).startsWith("[object Temporal.")) {
    return (value as { toString(): string }).toString();
  }
  if (Array.isArray(value)) return value.map(plain);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]));
}

/** Content lines joined with CRLF. */
export function ics(...lines: readonly string[]): string {
  return `${lines.join("\r\n")}\r\n`;
}

/** One VCALENDAR around `lines`; its BEGIN is line 1 and `lines` start at line 2. */
export function calendarText(...lines: readonly string[]): string {
  return ics("BEGIN:VCALENDAR", ...lines, "END:VCALENDAR");
}

/** One VEVENT with a UID and DTSTART, then `lines`: they start at line 5. */
export function eventText(...lines: readonly string[]): string {
  return calendarText(
    "BEGIN:VEVENT",
    "UID:event@example.com",
    "DTSTART:20260301T090000Z",
    ...lines,
    "END:VEVENT",
  );
}

export function parse(text: string, options?: IcsParseOptions): IcsParseResult {
  return parseIcs(text, options);
}

export function onlyCalendar<T extends IcsExtensionsConfig>(
  result: IcsParseResult<T>,
): IcsCalendar<T> {
  expect(result.calendars).toHaveLength(1);
  return result.calendars[0]!;
}

/** The only event of `eventText(...lines)`, and the issues. */
export function parseEvent(...lines: readonly string[]): {
  readonly event: IcsEvent;
  readonly issues: readonly IcsIssue[];
} {
  const result = parse(eventText(...lines));
  const { events } = onlyCalendar(result);
  expect(events).toHaveLength(1);
  return { event: events[0]!, issues: result.issues };
}

/** The issues without their messages, which are prose. */
export function issuesOf(issues: readonly IcsIssue[]): readonly Omit<IcsIssue, "message">[] {
  return issues.map(({ message: _message, ...issue }) => issue);
}

export const EVENT_PATH = ["calendars", 0, "events", 0] as const;

/** A minimal Standard Schema V1, written by hand: the package has no dependencies. */
export function schema<Input, Output>(
  validate: (
    value: unknown,
  ) => StandardSchemaV1.Result<Output> | Promise<StandardSchemaV1.Result<Output>>,
): StandardSchemaV1<Input, Output> {
  return { "~standard": { validate, vendor: "ics-model-tests", version: 1 } };
}
