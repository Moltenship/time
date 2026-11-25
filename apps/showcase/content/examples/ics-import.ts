// #region read
import { getEventEnd, parseIcs, type IcsDateValue, type IcsIssue } from "@moltenship/ics";

export interface ImportedEvent {
  readonly id: string;
  readonly title: string;
  readonly allDay: boolean;
  readonly start: Temporal.Instant;
  readonly end: Temporal.Instant;
}

export interface ImportResult {
  readonly events: readonly ImportedEvent[];
  /** What to tell the person about the file, one line per problem. */
  readonly problems: readonly string[];
}

export async function readIcsFile(file: File, viewerTimeZone: string): Promise<ImportResult> {
  // `File.text()` decodes the bytes as UTF-8, the encoding iCalendar files use.
  const { calendars, issues } = parseIcs(await file.text());

  const events = calendars.flatMap((calendar) => {
    // Times without a zone are read in the file's X-WR-TIMEZONE, else in the viewer's zone.
    const timeZone = calendar.timeZone ?? viewerTimeZone;
    return calendar.events.map((event) => ({
      id: event.uid,
      title: event.summary ?? "Untitled",
      allDay: event.start.kind === "date",
      start: toInstant(event.start, timeZone),
      end: toInstant(getEventEnd(event), timeZone),
    }));
  });

  return { events, problems: issues.filter(isError).map(describe) };
}
// #endregion read

// #region instant
function toInstant(value: IcsDateValue, timeZone: string): Temporal.Instant {
  switch (value.kind) {
    case "utc":
      return value.instant;
    case "zoned":
      return value.zoned.toInstant();
    case "date":
      // An all-day event starts when its date starts in the chosen zone.
      return value.date.toZonedDateTime(timeZone).toInstant();
    case "floating":
    case "unresolved":
      return value.wallTime.toZonedDateTime(timeZone).toInstant();
  }
}
// #endregion instant

// #region problems
function isError(issue: IcsIssue): boolean {
  return issue.severity === "error";
}

function describe(issue: IcsIssue): string {
  return issue.line === undefined ? issue.message : `Line ${issue.line}: ${issue.message}`;
}
// #endregion problems

// #region strict
import { IcsParseError } from "@moltenship/ics";

/** The file's calendars, or the reason the file is refused. */
export function readStrictly(text: string) {
  try {
    return { ok: true as const, calendars: parseIcs(text, { strict: true }).calendars };
  } catch (error) {
    if (!(error instanceof IcsParseError)) throw error;
    return { ok: false as const, reason: error.message, issues: error.issues };
  }
}
// #endregion strict

// #region upload
import { createIcsParser } from "@moltenship/ics";

const parser = createIcsParser();

/** A route handler for a form with an `<input type="file" name="calendar">`. */
export async function POST(request: Request): Promise<Response> {
  const file = (await request.formData()).get("calendar");
  const body = file instanceof File ? await file.text() : undefined;

  // A parser is a Standard Schema: it fails with the errors, or succeeds with the result.
  const result = await parser["~standard"].validate(body);
  if (result.issues) {
    return Response.json({ errors: result.issues.map((issue) => issue.message) }, { status: 400 });
  }

  const events = result.value.calendars.flatMap((calendar) => calendar.events);
  return Response.json({ imported: events.length });
}
// #endregion upload
