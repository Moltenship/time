import { parseIcsComponents } from "../syntax";
import { createTimeZoneResolver } from "../time-zones";
import type {
  IcsCalendar,
  IcsComponent,
  IcsEvent,
  IcsFreeBusy,
  IcsIssue,
  IcsJournal,
  IcsParseResult,
  IcsTimeZone,
  IcsTimeZoneResolver,
  IcsTodo,
} from "../types";
import { decodeIcsValue } from "../values";
import { readEvent, readFreeBusy, readJournal, readTimeZone, readTodo } from "./components";
import { readExtensions, type AnyExtensions, type ExtensionEntries } from "./extensions";
import { ComponentReader, defined, type CalendarScope } from "./reader";

/** A parser's options, prepared once. */
export interface ParseConfig {
  readonly extensions: {
    readonly calendar: ExtensionEntries;
    readonly event: ExtensionEntries;
    readonly journal: ExtensionEntries;
    readonly todo: ExtensionEntries;
  };
  readonly resolveTimeZone: IcsTimeZoneResolver | undefined;
}

function push<T>(items: T[], item: T | undefined): void {
  if (item !== undefined) items.push(item);
}

// X-WR-TIMEZONE, resolved like a TZID. An unresolvable one is reported and left out.
function calendarTimeZone(read: ComponentReader): string | undefined {
  const property = read.one("X-WR-TIMEZONE", "timeZone");
  if (property === undefined) return undefined;
  const tzid = read.decode(property, decodeIcsValue("TEXT", property.value), "timeZone");
  const timeZone = tzid && read.scope.resolveTimeZone(tzid);
  if (tzid !== undefined && timeZone === undefined)
    read.unknownTimeZone(tzid, property, "timeZone");
  return timeZone;
}

function readCalendar(
  component: IcsComponent,
  index: number,
  issues: IcsIssue[],
  config: ParseConfig,
): IcsCalendar<AnyExtensions> {
  const definitions = new Map<string, IcsComponent>();
  for (const child of component.components) {
    if (child.name !== "VTIMEZONE") continue;
    const tzid = child.properties.find((property) => property.name === "TZID")?.value;
    if (tzid !== undefined && !definitions.has(tzid)) definitions.set(tzid, child);
  }
  const scope: CalendarScope = {
    issues,
    resolveTimeZone: createTimeZoneResolver({ custom: config.resolveTimeZone, definitions }),
    unknownTimeZones: new Map(),
  };
  const read = new ComponentReader(component, scope, ["calendars", index], ["calendars"]);

  // The calendar's own properties come first, as they usually do in the text. RFC 7986 lets NAME
  // and DESCRIPTION repeat once per language; the X-WR-* fallbacks are read either way, so they
  // never land in otherProperties.
  const name = read.text("NAME", "name", true);
  const wrName = read.text("X-WR-CALNAME", "name");
  const description = read.text("DESCRIPTION", "description", true);
  const wrDescription = read.text("X-WR-CALDESC", "description");
  const refreshInterval = read.value("REFRESH-INTERVAL", "refreshInterval", "DURATION");
  const publishedTtl = read.value("X-PUBLISHED-TTL", "refreshInterval", "DURATION");
  const properties = {
    calendarScale: read.text("CALSCALE", "calendarScale"),
    color: read.text("COLOR", "color"),
    description: description ?? wrDescription,
    extensions: readExtensions(read, config.extensions.calendar),
    lastModified: read.timestamp("LAST-MODIFIED", "lastModified"),
    method: read.enumerated("METHOD", "method"),
    name: name ?? wrName,
    productId: read.text("PRODID", "productId"),
    refreshInterval: refreshInterval ?? publishedTtl,
    source: read.value("SOURCE", "source", "URI"),
    timeZone: calendarTimeZone(read),
    uid: read.text("UID", "uid"),
    url: read.value("URL", "url", "URI"),
    version: read.text("VERSION", "version"),
  };

  const events: IcsEvent<AnyExtensions>[] = [];
  const todos: IcsTodo<AnyExtensions>[] = [];
  const journals: IcsJournal<AnyExtensions>[] = [];
  const freeBusy: IcsFreeBusy[] = [];
  const timeZones: IcsTimeZone[] = [];
  const otherComponents: IcsComponent[] = [];
  const { event, journal, todo } = config.extensions;
  for (const child of component.components) {
    switch (child.name) {
      case "VEVENT":
        push(events, readEvent(read.child(child, "events", events.length), event));
        break;
      case "VTODO":
        push(todos, readTodo(read.child(child, "todos", todos.length), todo));
        break;
      case "VJOURNAL":
        push(journals, readJournal(read.child(child, "journals", journals.length), journal));
        break;
      case "VFREEBUSY":
        push(freeBusy, readFreeBusy(read.child(child, "freeBusy", freeBusy.length)));
        break;
      case "VTIMEZONE":
        push(timeZones, readTimeZone(read.child(child, "timeZones", timeZones.length)));
        break;
      default:
        otherComponents.push(child);
    }
  }

  return defined({
    ...properties,
    events,
    freeBusy,
    journals,
    otherComponents,
    otherProperties: read.others(),
    timeZones,
    todos,
  });
}

// Parses the text into calendars. Never throws: whatever is wrong is an issue. Issues come in
// source order; fields aren't read in that order, so they're sorted, stably, by line.
export function parseCalendars(text: string, config: ParseConfig): IcsParseResult {
  const parsed = parseIcsComponents(text);
  const issues = [...parsed.issues];
  const calendars: IcsCalendar<AnyExtensions>[] = [];
  for (const component of parsed.components) {
    if (component.name === "VCALENDAR") {
      calendars.push(readCalendar(component, calendars.length, issues, config));
      continue;
    }
    issues.push(
      defined<IcsIssue>({
        code: "invalid-structure",
        component: component.name,
        line: component.line,
        message: `${component.name} outside a VCALENDAR; skipped`,
        path: [],
        severity: "warning",
      }),
    );
  }
  // Text without a calendar, empty text included, is never a valid result. Text that isn't
  // iCalendar at all already has an error from the syntax layer that says so.
  if (calendars.length === 0 && !issues.some(({ severity }) => severity === "error")) {
    issues.push({
      code: "invalid-structure",
      message: "No VCALENDAR found",
      path: [],
      severity: "error",
    });
  }
  issues.sort((left, right) => (left.line ?? 0) - (right.line ?? 0));
  return { calendars, issues };
}
