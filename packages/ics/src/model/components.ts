// VEVENT, VTODO, VJOURNAL, VFREEBUSY, VTIMEZONE and VALARM. Each mapper returns `undefined` for a
// component it skips, after reporting why.

import type {
  IcsAlarm,
  IcsAlarmTrigger,
  IcsComponent,
  IcsDateValue,
  IcsEvent,
  IcsFreeBusy,
  IcsFreeBusyPeriods,
  IcsJournal,
  IcsPeriod,
  IcsProperty,
  IcsSchedulingFields,
  IcsTimeZone,
  IcsTimeZoneObservance,
  IcsTodo,
} from "../types";
import { decodeIcsValue, splitIcsValues } from "../values";
import { readExtensions, type AnyExtensions, type ExtensionEntries } from "./extensions";
import {
  attachments,
  attendees,
  conferences,
  exceptionDates,
  geo,
  organizer,
  recurrenceDates,
  relations,
  textItems,
  texts,
} from "./fields";
import { defined, parameter, upper, type ComponentReader } from "./reader";

const DATE_TIME_SHAPE = /^\d{8}T/i;

// The fields VEVENT, VTODO and VJOURNAL share, apart from `otherProperties`, which comes last.
function schedulingFields(
  read: ComponentReader,
  uid: string,
): Omit<IcsSchedulingFields, "otherProperties"> {
  const recurrenceIdProperty = read.one("RECURRENCE-ID", "recurrenceId");
  return {
    attachments: attachments(read),
    attendees: attendees(read),
    categories: textItems(read, "CATEGORIES", "categories"),
    classification: read.enumerated("CLASS", "classification"),
    color: read.text("COLOR", "color"),
    comments: texts(read, "COMMENT", "comments"),
    contacts: texts(read, "CONTACT", "contacts"),
    created: read.timestamp("CREATED", "created"),
    // VJOURNAL may hold several; the first is the description, the rest stay as written.
    description: read.text("DESCRIPTION", "description", read.component.name === "VJOURNAL"),
    exceptionDates: exceptionDates(read),
    lastModified: read.timestamp("LAST-MODIFIED", "lastModified"),
    organizer: organizer(read),
    recurrenceDates: recurrenceDates(read),
    recurrenceId:
      recurrenceIdProperty &&
      read.decode(
        recurrenceIdProperty,
        read.dateResult(recurrenceIdProperty, recurrenceIdProperty.value),
        "recurrenceId",
      ),
    recurrenceRange: recurrenceIdProperty && recurrenceRange(read, recurrenceIdProperty),
    recurrenceRule: read.value("RRULE", "recurrenceRule", "RECUR"),
    relatedTo: relations(read),
    sequence: read.value("SEQUENCE", "sequence", "INTEGER"),
    stamp: read.timestamp("DTSTAMP", "stamp"),
    summary: read.text("SUMMARY", "summary"),
    uid,
    url: read.value("URL", "url", "URI"),
  };
}

function recurrenceRange(
  read: ComponentReader,
  property: IcsProperty,
): "THISANDFUTURE" | undefined {
  const range = parameter(property, "RANGE");
  switch (upper(range)) {
    case undefined:
      return undefined;
    case "THISANDFUTURE":
      return "THISANDFUTURE";
    case "THISANDPRIOR": {
      const message = "RECURRENCE-ID: RANGE=THISANDPRIOR was removed in RFC 5545; ignored";
      read.report("warning", "unsupported", message, property, "recurrenceRange");
      return undefined;
    }
    default:
      read.report(
        "error",
        "invalid-value",
        `RECURRENCE-ID: RANGE=${range} isn't THISANDFUTURE; dropped`,
        property,
        "recurrenceRange",
      );
      return undefined;
  }
}

// Dates compare by date, absolute times by instant, and wall times in the same frame by wall
// time; anything else doesn't compare.
function compare(left: IcsDateValue, right: IcsDateValue): number | undefined {
  if (left.kind === "date" || right.kind === "date") {
    return left.kind === "date" && right.kind === "date"
      ? Temporal.PlainDate.compare(left.date, right.date)
      : undefined;
  }
  const instant = (value: IcsDateValue) =>
    value.kind === "utc"
      ? value.instant
      : value.kind === "zoned"
        ? value.zoned.toInstant()
        : undefined;
  const leftInstant = instant(left);
  const rightInstant = instant(right);
  if (leftInstant && rightInstant) return Temporal.Instant.compare(leftInstant, rightInstant);
  if (
    (left.kind === "floating" && right.kind === "floating") ||
    (left.kind === "unresolved" && right.kind === "unresolved" && left.tzid === right.tzid)
  ) {
    return Temporal.PlainDateTime.compare(left.wallTime, right.wallTime);
  }
  return undefined;
}

// DTEND (or a VTODO's DUE) and DURATION. RFC 5545 allows one of them; DTEND wins. DTEND is
// checked against DTSTART and kept, whatever the check finds.
function endAndDuration(
  read: ComponentReader,
  start: IcsDateValue | undefined,
  name: "DTEND" | "DUE",
  field: "due" | "end",
): { readonly duration?: Temporal.Duration; readonly end?: IcsDateValue } {
  const endProperty = read.one(name, field);
  const end =
    endProperty && read.decode(endProperty, read.dateResult(endProperty, endProperty.value), field);
  const durationProperty = read.one("DURATION", "duration");

  if (endProperty !== undefined && end !== undefined && start !== undefined) {
    const typeOf = (value: IcsDateValue) => (value.kind === "date" ? "a DATE" : "a DATE-TIME");
    if (typeOf(start) !== typeOf(end)) {
      const message = `${name} is ${typeOf(end)} but DTSTART is ${typeOf(start)}`;
      read.report("warning", "invalid-value", message, endProperty, field);
    } else if ((compare(end, start) ?? 0) < 0) {
      read.report("warning", "invalid-value", `${name} is before DTSTART`, endProperty, field);
    }
  }

  if (durationProperty === undefined) return { end };
  if (end !== undefined) {
    const message = `${name} and DURATION exclude each other; DURATION is dropped`;
    read.report("warning", "conflicting-properties", message, durationProperty, "duration");
    return { end };
  }
  const duration = read.decode(
    durationProperty,
    decodeIcsValue("DURATION", durationProperty.value),
    "duration",
  );
  // RFC 5545 §3.8.2.5: a component's DURATION is positive. A negative one ends before it starts.
  if (duration !== undefined && duration.sign < 0) {
    const message = "DURATION is negative, which RFC 5545 doesn't allow";
    read.report("warning", "invalid-value", message, durationProperty, "duration");
  }
  return { duration, end };
}

function alarmsAndOthers(read: ComponentReader): {
  readonly alarms: IcsAlarm[];
  readonly otherComponents: IcsComponent[];
} {
  const alarms: IcsAlarm[] = [];
  const otherComponents: IcsComponent[] = [];
  for (const child of read.component.components) {
    if (child.name !== "VALARM") {
      otherComponents.push(child);
      continue;
    }
    const alarm = readAlarm(read.child(child, "alarms", alarms.length));
    if (alarm !== undefined) alarms.push(alarm);
  }
  return { alarms, otherComponents };
}

export function readEvent(
  read: ComponentReader,
  extensions: ExtensionEntries,
): IcsEvent<AnyExtensions> | undefined {
  if (!read.require("UID", "DTSTART")) return undefined;
  const startProperty = read.one("DTSTART", "start")!;
  const start = read.required(
    startProperty,
    read.dateResult(startProperty, startProperty.value),
    "start",
  );
  if (start === undefined) return undefined;

  const fields = {
    ...schedulingFields(read, read.text("UID", "uid")!),
    ...alarmsAndOthers(read),
    ...endAndDuration(read, start, "DTEND", "end"),
    conferences: conferences(read),
    extensions: readExtensions(read, extensions),
    geo: geo(read),
    location: read.text("LOCATION", "location"),
    priority: read.value("PRIORITY", "priority", "INTEGER"),
    resources: textItems(read, "RESOURCES", "resources"),
    start,
    status: read.enumerated("STATUS", "status"),
    transparency: read.enumerated("TRANSP", "transparency"),
  };
  return defined({ ...fields, otherProperties: read.others() });
}

export function readTodo(
  read: ComponentReader,
  extensions: ExtensionEntries,
): IcsTodo<AnyExtensions> | undefined {
  if (!read.require("UID")) return undefined;
  const start = read.date("DTSTART", "start");
  const { duration, end: due } = endAndDuration(read, start, "DUE", "due");
  const fields = {
    ...schedulingFields(read, read.text("UID", "uid")!),
    ...alarmsAndOthers(read),
    completed: read.timestamp("COMPLETED", "completed"),
    conferences: conferences(read),
    due,
    duration,
    extensions: readExtensions(read, extensions),
    geo: geo(read),
    location: read.text("LOCATION", "location"),
    percentComplete: read.value("PERCENT-COMPLETE", "percentComplete", "INTEGER"),
    priority: read.value("PRIORITY", "priority", "INTEGER"),
    resources: textItems(read, "RESOURCES", "resources"),
    start,
    status: read.enumerated("STATUS", "status"),
  };
  return defined({ ...fields, otherProperties: read.others() });
}

export function readJournal(
  read: ComponentReader,
  extensions: ExtensionEntries,
): IcsJournal<AnyExtensions> | undefined {
  if (!read.require("UID")) return undefined;
  const fields = {
    ...schedulingFields(read, read.text("UID", "uid")!),
    extensions: readExtensions(read, extensions),
    otherComponents: read.component.components,
    start: read.date("DTSTART", "start"),
    status: read.enumerated("STATUS", "status"),
  };
  return defined({ ...fields, otherProperties: read.others() });
}

export function readFreeBusy(read: ComponentReader): IcsFreeBusy | undefined {
  if (!read.require("UID")) return undefined;
  const fields = {
    attendees: attendees(read),
    comments: texts(read, "COMMENT", "comments"),
    contact: read.text("CONTACT", "contact"),
    end: read.date("DTEND", "end"),
    freeBusy: read.list("FREEBUSY", "freeBusy", (property, at): IcsFreeBusyPeriods => {
      const periods: IcsPeriod[] = [];
      for (const raw of splitIcsValues("PERIOD", property.value)) {
        if (raw === "") continue;
        const result = decodeIcsValue("PERIOD", raw, read.context(property));
        const period = read.decode(
          property,
          result,
          [...at, "periods", periods.length],
          [...at, "periods"],
        );
        if (period !== undefined) periods.push(period);
      }
      return { periods, type: upper(parameter(property, "FBTYPE")) ?? "BUSY" };
    }),
    organizer: organizer(read),
    otherComponents: read.component.components,
    stamp: read.timestamp("DTSTAMP", "stamp"),
    start: read.date("DTSTART", "start"),
    uid: read.text("UID", "uid")!,
    url: read.value("URL", "url", "URI"),
  };
  return defined({ ...fields, otherProperties: read.others() });
}

function readTrigger(read: ComponentReader): IcsAlarmTrigger | undefined {
  const property = read.one("TRIGGER", "trigger")!;
  const declared = upper(parameter(property, "VALUE"));
  // TRIGGER defaults to DURATION, but RFC 5545's own example writes an absolute one without
  // VALUE=DATE-TIME: such a value is read by its shape.
  if (
    declared === "DATE-TIME" ||
    (declared === undefined && DATE_TIME_SHAPE.test(property.value))
  ) {
    if (declared === undefined) {
      const message = "TRIGGER: a DATE-TIME without VALUE=DATE-TIME; read as DATE-TIME";
      read.report("warning", "invalid-value", message, property, "trigger");
    }
    const instant = read.instant(property, "trigger", true);
    if (instant === "date") {
      const message = "TRIGGER: a DATE isn't a time to alarm at; the VALARM is skipped";
      read.skip("invalid-value", message, property.name, property.line);
      return undefined;
    }
    return instant && { instant, kind: "absolute" };
  }

  const offset = read.required(property, decodeIcsValue("DURATION", property.value), "trigger");
  if (offset === undefined) return undefined;
  const related = parameter(property, "RELATED");
  const relatedTo = upper(related);
  if (related !== undefined && relatedTo !== "START" && relatedTo !== "END") {
    const message = `TRIGGER: RELATED=${related} isn't START or END; read as START`;
    read.report("warning", "invalid-value", message, property, ["trigger", "relatedTo"]);
  }
  return { kind: "relative", offset, relatedTo: relatedTo === "END" ? "END" : "START" };
}

function readAlarm(read: ComponentReader): IcsAlarm | undefined {
  if (!read.require("ACTION", "TRIGGER")) return undefined;
  const trigger = readTrigger(read);
  if (trigger === undefined) return undefined;
  const fields = {
    action: read.enumerated("ACTION", "action")!,
    attachments: attachments(read),
    attendees: attendees(read),
    description: read.text("DESCRIPTION", "description"),
    duration: read.value("DURATION", "duration", "DURATION"),
    otherComponents: read.component.components,
    repeat: read.value("REPEAT", "repeat", "INTEGER"),
    summary: read.text("SUMMARY", "summary"),
    trigger,
    uid: read.text("UID", "uid"),
  };
  return defined({ ...fields, otherProperties: read.others() });
}

function readObservance(read: ComponentReader): IcsTimeZoneObservance | undefined {
  if (!read.require("DTSTART", "TZOFFSETFROM", "TZOFFSETTO")) return undefined;
  const required = <TType extends "DATE-TIME" | "UTC-OFFSET">(
    property: IcsProperty,
    field: string,
    type: TType,
  ) => read.required(property, decodeIcsValue(type, property.value), field);
  const startProperty = read.one("DTSTART", "start")!;
  const start = required(startProperty, "start", "DATE-TIME");
  const offsetFrom = required(read.one("TZOFFSETFROM", "offsetFrom")!, "offsetFrom", "UTC-OFFSET");
  const offsetTo = required(read.one("TZOFFSETTO", "offsetTo")!, "offsetTo", "UTC-OFFSET");
  if (start === undefined || offsetFrom === undefined || offsetTo === undefined) return undefined;

  let wallTime: Temporal.PlainDateTime;
  if (start.kind === "utc") {
    // An onset is a local time; a Z there is a mistake, and the time as written is the best guess.
    const message = "DTSTART of an observance is a local time; read without its Z";
    read.report("warning", "invalid-value", message, startProperty, "start");
    wallTime = start.instant.toZonedDateTimeISO("UTC").toPlainDateTime();
  } else {
    wallTime = start.wallTime;
  }

  const fields = {
    comments: texts(read, "COMMENT", "comments"),
    kind: read.component.name === "DAYLIGHT" ? ("daylight" as const) : ("standard" as const),
    names: texts(read, "TZNAME", "names"),
    offsetFrom,
    offsetTo,
    recurrenceDates: recurrenceDates(read),
    recurrenceRule: read.value("RRULE", "recurrenceRule", "RECUR"),
    start: wallTime,
  };
  return defined({ ...fields, otherProperties: read.others() });
}

export function readTimeZone(read: ComponentReader): IcsTimeZone | undefined {
  if (!read.require("TZID")) return undefined;
  const tzid = read.text("TZID", "tzid")!;
  const observances: IcsTimeZoneObservance[] = [];
  const otherComponents: IcsComponent[] = [];
  for (const child of read.component.components) {
    if (child.name !== "STANDARD" && child.name !== "DAYLIGHT") {
      otherComponents.push(child);
      continue;
    }
    const observance = readObservance(read.child(child, "observances", observances.length));
    if (observance !== undefined) observances.push(observance);
  }
  const fields = {
    lastModified: read.timestamp("LAST-MODIFIED", "lastModified"),
    observances,
    otherComponents,
    timeZone: read.scope.resolveTimeZone(tzid),
    tzid,
    url: read.value("TZURL", "url", "URI"),
  };
  return defined({ ...fields, otherProperties: read.others() });
}
