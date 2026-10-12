import type { IcsProperty, IcsValueType } from "../types";

const VALUE_TYPES: ReadonlySet<string> = new Set<IcsValueType>([
  "BINARY",
  "BOOLEAN",
  "CAL-ADDRESS",
  "DATE",
  "DATE-TIME",
  "DURATION",
  "FLOAT",
  "INTEGER",
  "PERIOD",
  "RECUR",
  "TEXT",
  "TIME",
  "URI",
  "UTC-OFFSET",
]);

// Properties whose default isn't TEXT: RFC 5545 §3.7–3.8, RFC 7986, RFC 9074 and common
// extensions. EXRULE is RFC 2445's, gone from RFC 5545 but still written by old exporters.
const DEFAULT_VALUE_TYPES: Readonly<Record<string, IcsValueType>> = {
  ACKNOWLEDGED: "DATE-TIME",
  ATTACH: "URI",
  ATTENDEE: "CAL-ADDRESS",
  COMPLETED: "DATE-TIME",
  CONFERENCE: "URI",
  CREATED: "DATE-TIME",
  DTEND: "DATE-TIME",
  DTSTAMP: "DATE-TIME",
  DTSTART: "DATE-TIME",
  DUE: "DATE-TIME",
  DURATION: "DURATION",
  EXDATE: "DATE-TIME",
  EXRULE: "RECUR",
  FREEBUSY: "PERIOD",
  GEO: "FLOAT",
  IMAGE: "URI",
  "LAST-MODIFIED": "DATE-TIME",
  ORGANIZER: "CAL-ADDRESS",
  "PERCENT-COMPLETE": "INTEGER",
  PRIORITY: "INTEGER",
  RDATE: "DATE-TIME",
  "RECURRENCE-ID": "DATE-TIME",
  "REFRESH-INTERVAL": "DURATION",
  REPEAT: "INTEGER",
  RRULE: "RECUR",
  SEQUENCE: "INTEGER",
  SOURCE: "URI",
  TRIGGER: "DURATION",
  TZOFFSETFROM: "UTC-OFFSET",
  TZOFFSETTO: "UTC-OFFSET",
  TZURL: "URI",
  URL: "URI",
  "X-PUBLISHED-TTL": "DURATION",
};

/** The property's value type: its VALUE parameter, else its registered default, else TEXT. */
export function icsValueTypeOf(property: IcsProperty): IcsValueType {
  const declared = property.parameters["VALUE"]?.[0];
  if (declared !== undefined) {
    const type = declared.toUpperCase();
    return VALUE_TYPES.has(type) ? (type as IcsValueType) : "TEXT";
  }

  const name = property.name.toUpperCase();
  return Object.hasOwn(DEFAULT_VALUE_TYPES, name) ? DEFAULT_VALUE_TYPES[name]! : "TEXT";
}
