// Mappers for the properties several components share.

import type {
  IcsAttachment,
  IcsAttendee,
  IcsCalendarUser,
  IcsConference,
  IcsDateValue,
  IcsGeo,
  IcsParameters,
  IcsPeriod,
  IcsProperty,
  IcsRelation,
} from "../types";
import { decodeIcsValue } from "../values";
import { quote } from "../values/result";
import { defined, parameter, upper, type ComponentReader, type Path } from "./reader";

const USER_PARAMETERS = ["CN", "DIR", "EMAIL", "LANGUAGE", "SENT-BY"];
const ATTENDEE_PARAMETERS = [
  ...USER_PARAMETERS,
  "CUTYPE",
  "DELEGATED-FROM",
  "DELEGATED-TO",
  "MEMBER",
  "PARTSTAT",
  "ROLE",
  "RSVP",
];
const MAILTO = /^mailto:/i;

// Parameter names come from the text: without a prototype, `constructor` reads as undefined.
function otherParameters(property: IcsProperty, mapped: readonly string[]): IcsParameters {
  const others: Record<string, readonly string[] | undefined> = Object.create(null);
  for (const [name, values] of Object.entries(property.parameters)) {
    if (!mapped.includes(name)) others[name] = values;
  }
  return others;
}

function calendarUserFields(property: IcsProperty, mapped: readonly string[]): IcsCalendarUser {
  const address = property.value;
  return {
    address,
    directory: parameter(property, "DIR"),
    email:
      parameter(property, "EMAIL") ??
      (MAILTO.test(address) ? address.slice("mailto:".length) : undefined),
    language: parameter(property, "LANGUAGE"),
    name: parameter(property, "CN"),
    otherParameters: otherParameters(property, mapped),
    sentBy: parameter(property, "SENT-BY"),
  };
}

export function organizer(read: ComponentReader): IcsCalendarUser | undefined {
  const property = read.one("ORGANIZER", "organizer");
  return property && defined(calendarUserFields(property, USER_PARAMETERS));
}

function attendee(read: ComponentReader, property: IcsProperty, at: Path): IcsAttendee {
  const rsvp = parameter(property, "RSVP");
  const answer = upper(rsvp);
  if (rsvp !== undefined && answer !== "TRUE" && answer !== "FALSE") {
    const message = `ATTENDEE: RSVP=${quote(rsvp)} isn't TRUE or FALSE; dropped`;
    read.report("error", "invalid-value", message, property, [...at, "rsvp"]);
  }
  return defined<IcsAttendee>({
    ...calendarUserFields(property, ATTENDEE_PARAMETERS),
    calendarUserType: upper(parameter(property, "CUTYPE")),
    delegatedFrom: property.parameters["DELEGATED-FROM"] ?? [],
    delegatedTo: property.parameters["DELEGATED-TO"] ?? [],
    memberOf: property.parameters["MEMBER"] ?? [],
    participationStatus: upper(parameter(property, "PARTSTAT")),
    role: upper(parameter(property, "ROLE")),
    rsvp: answer === "TRUE" ? true : answer === "FALSE" ? false : undefined,
  });
}

export function attendees(read: ComponentReader): IcsAttendee[] {
  return read.list("ATTENDEE", "attendees", (property, at) => attendee(read, property, at));
}

export function attachments(read: ComponentReader): IcsAttachment[] {
  return read.list("ATTACH", "attachments", (property, at, field): IcsAttachment | undefined => {
    const formatType = parameter(property, "FMTTYPE");
    const binary =
      upper(parameter(property, "VALUE")) === "BINARY" ||
      upper(parameter(property, "ENCODING")) === "BASE64";
    if (!binary) return defined<IcsAttachment>({ formatType, kind: "uri", uri: property.value });
    const data = read.decode(property, decodeIcsValue("BINARY", property.value), at, field);
    return data === undefined
      ? undefined
      : defined<IcsAttachment>({ data, formatType, kind: "binary" });
  });
}

export function conferences(read: ComponentReader): IcsConference[] {
  return read.list("CONFERENCE", "conferences", (property) =>
    defined({
      // FEATURE values are case-insensitive, as every enumerated parameter value is.
      features: (property.parameters["FEATURE"] ?? []).map((feature) => feature.toUpperCase()),
      label: parameter(property, "LABEL"),
      uri: property.value,
    }),
  );
}

export function relations(read: ComponentReader): IcsRelation[] {
  return read.list("RELATED-TO", "relatedTo", (property, at) => {
    const uid = read.decode(property, decodeIcsValue("TEXT", property.value), at);
    return uid === undefined
      ? undefined
      : defined<IcsRelation>({ relationship: upper(parameter(property, "RELTYPE")), uid });
  });
}

// Every occurrence of a TEXT property, such as COMMENT.
export function texts(read: ComponentReader, name: string, field: string): string[] {
  return read.list(name, field, (property, at) =>
    read.decode(property, decodeIcsValue("TEXT", property.value), at),
  );
}

// Every value of a TEXT list property, such as CATEGORIES.
export function textItems(read: ComponentReader, name: string, field: string): string[] {
  return read.items(name, field, (_, raw) => decodeIcsValue("TEXT", raw));
}

export function exceptionDates(read: ComponentReader): IcsDateValue[] {
  return read.items("EXDATE", "exceptionDates", (property, raw) => read.dateResult(property, raw));
}

export function recurrenceDates(read: ComponentReader): (IcsDateValue | IcsPeriod)[] {
  return read.items<IcsDateValue | IcsPeriod>("RDATE", "recurrenceDates", (property, raw, type) =>
    type === "PERIOD"
      ? decodeIcsValue("PERIOD", raw, read.context(property))
      : read.dateResult(property, raw),
  );
}

export function geo(read: ComponentReader): IcsGeo | undefined {
  const property = read.one("GEO", "geo");
  if (property === undefined) return undefined;
  const parts = property.value.split(";");
  if (parts.length !== 2) {
    const message = `GEO: ${quote(property.value)} isn't latitude;longitude`;
    read.report("error", "invalid-value", message, property, "geo");
    return undefined;
  }
  const [latitude, longitude] = parts.map((part) =>
    read.decode(property, decodeIcsValue("FLOAT", part), "geo"),
  );
  return latitude === undefined || longitude === undefined ? undefined : { latitude, longitude };
}
