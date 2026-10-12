// The public data model. Interface fields are listed alphabetically.
//
// Three layers, each usable on its own:
// - syntax: `IcsComponent` / `IcsProperty`, a lossless tree of the text;
// - values: `IcsDecodedValueMap`, one Temporal-backed type per RFC 5545 value type;
// - components: `IcsCalendar`, `IcsEvent` and friends, the typed result of `parseIcs`.

import type { StandardSchemaV1 } from "./standard-schema";

// ── Syntax ──────────────────────────────────────────────────────────────────────────────────────

/** One content line after unfolding. */
export interface IcsProperty {
  /** 1-based line of the property's first physical line; absent for properties built in code. */
  readonly line?: number;
  /** Upper-cased property name, such as `DTSTART` or `X-WR-CALNAME`. */
  readonly name: string;
  /**
   * Upper-cased parameter names to their values: unquoted, RFC 6868-decoded and split on commas
   * outside quotes, in source order. Indexing an absent parameter gives `undefined`.
   */
  readonly parameters: IcsParameters;
  /** The value exactly as written after unfolding: TEXT escapes are still in place. */
  readonly value: string;
}

export type IcsParameters = Readonly<Partial<Record<string, readonly string[]>>>;

/** A `BEGIN:…` / `END:…` block. */
export interface IcsComponent {
  /** Nested components in source order. */
  readonly components: readonly IcsComponent[];
  /** 1-based line of the `BEGIN` line; absent for components built in code. */
  readonly line?: number;
  /** Upper-cased component name, such as `VCALENDAR` or `VEVENT`. */
  readonly name: string;
  /** Properties in source order. */
  readonly properties: readonly IcsProperty[];
}

// ── Issues ──────────────────────────────────────────────────────────────────────────────────────

export type IcsIssueSeverity = "error" | "warning";

export type IcsIssueCode =
  /**
   * A required property is absent, such as UID or DTSTART: an error that skips the component. The
   * issue's line is the component's BEGIN line.
   */
  | "missing-property"
  /** A property that may occur once occurs again: a warning; the first one wins. */
  | "duplicate-property"
  /**
   * Properties that exclude each other: a warning. DTEND wins over DURATION; a rule with both
   * COUNT and UNTIL keeps both.
   */
  | "conflicting-properties"
  /** A line that isn't `name *(;param) : value`, or an invalid parameter. */
  | "invalid-content-line"
  /** BEGIN/END nesting is broken: an END without its BEGIN, or a component left open. */
  | "invalid-structure"
  /** A value doesn't parse as its value type. */
  | "invalid-value"
  /** A TZID that resolves to no time zone. The value is kept as `unresolved`. */
  | "unknown-time-zone"
  /** A construct the package recognizes but doesn't interpret, such as RSCALE. */
  | "unsupported"
  /** An extension's Standard Schema rejected a value, or returned a promise. */
  | "schema";

export interface IcsIssue {
  readonly code: IcsIssueCode;
  /** Upper-cased name of the component the issue belongs to, such as `VEVENT`. */
  readonly component?: string;
  /** 1-based source line, when the issue comes from one. */
  readonly line?: number;
  readonly message: string;
  /**
   * Where the issue lands in the typed result, such as `["calendars", 0, "events", 3, "start"]`.
   * Indexes count the components that were kept; a skipped component's path ends at its
   * collection, such as `["calendars", 0, "events"]`. Empty for syntax issues.
   */
  readonly path: readonly (number | string)[];
  /** Upper-cased name of the property the issue belongs to, such as `DTSTART`. */
  readonly property?: string;
  /** Errors drop the value or component they concern; warnings keep a best-effort value. */
  readonly severity: IcsIssueSeverity;
}

// ── Values ──────────────────────────────────────────────────────────────────────────────────────

export type IcsValueType =
  | "BINARY"
  | "BOOLEAN"
  | "CAL-ADDRESS"
  | "DATE"
  | "DATE-TIME"
  | "DURATION"
  | "FLOAT"
  | "INTEGER"
  | "PERIOD"
  | "RECUR"
  | "TEXT"
  | "TIME"
  | "URI"
  | "UTC-OFFSET";

/** A DATE value. */
export interface IcsDate {
  readonly date: Temporal.PlainDate;
  readonly kind: "date";
}

/** A DATE-TIME ending in `Z`. */
export interface IcsUtcDateTime {
  readonly instant: Temporal.Instant;
  readonly kind: "utc";
}

/**
 * A DATE-TIME with a TZID that resolved to a time zone. A wall time in a DST gap or fold resolves
 * as RFC 5545 §3.3.5 says, which is Temporal's `compatible` disambiguation.
 */
export interface IcsZonedDateTime {
  readonly kind: "zoned";
  /** The TZID parameter as written. `zoned.timeZoneId` is the time zone it resolved to. */
  readonly tzid: string;
  /** The wall time as written, which differs from `zoned` inside a DST gap. */
  readonly wallTime: Temporal.PlainDateTime;
  readonly zoned: Temporal.ZonedDateTime;
}

/** A DATE-TIME with a TZID that resolved to no time zone. */
export interface IcsUnresolvedDateTime {
  readonly kind: "unresolved";
  readonly tzid: string;
  readonly wallTime: Temporal.PlainDateTime;
}

/** A DATE-TIME with neither `Z` nor TZID: the same wall time in every time zone. */
export interface IcsFloatingDateTime {
  readonly kind: "floating";
  readonly wallTime: Temporal.PlainDateTime;
}

export type IcsDateTime =
  | IcsFloatingDateTime
  | IcsUnresolvedDateTime
  | IcsUtcDateTime
  | IcsZonedDateTime;

/** What DTSTART, DTEND, DUE, RECURRENCE-ID, EXDATE, RDATE and UNTIL may hold. */
export type IcsDateValue = IcsDate | IcsDateTime;

/** A TIME value. */
export interface IcsTime {
  readonly time: Temporal.PlainTime;
  /** The value ends in `Z`. */
  readonly utc: boolean;
}

/** A PERIOD value: an explicit end, or a duration. */
export type IcsPeriod =
  | { readonly end: IcsDateTime; readonly start: IcsDateTime }
  | { readonly duration: Temporal.Duration; readonly start: IcsDateTime };

/**
 * A UTC-OFFSET value as a Temporal offset string, `±HH:MM` or `±HH:MM:SS`, such as `"+05:30"`.
 */
export type IcsUtcOffset = string;

export type IcsFrequency =
  | "DAILY"
  | "HOURLY"
  | "MINUTELY"
  | "MONTHLY"
  | "SECONDLY"
  | "WEEKLY"
  | "YEARLY";

export type IcsWeekday = "FR" | "MO" | "SA" | "SU" | "TH" | "TU" | "WE";

/** A BYDAY entry: `MO`, `1MO` (first Monday) or `-1FR` (last Friday). */
export interface IcsWeekdayNumber {
  /** −53 to 53, never 0; absent for every such weekday in the period. */
  readonly ordinal?: number;
  readonly weekday: IcsWeekday;
}

/** A RECUR value, parsed but not expanded. Parts that the rule doesn't state are absent. */
export interface IcsRecurrenceRule {
  readonly byDay?: readonly IcsWeekdayNumber[];
  readonly byHour?: readonly number[];
  readonly byMinute?: readonly number[];
  /** 1 to 12. */
  readonly byMonth?: readonly number[];
  /** −31 to 31, never 0. */
  readonly byMonthDay?: readonly number[];
  readonly bySecond?: readonly number[];
  /** −366 to 366, never 0. */
  readonly bySetPosition?: readonly number[];
  /** −53 to 53, never 0. */
  readonly byWeekNumber?: readonly number[];
  /** −366 to 366, never 0. */
  readonly byYearDay?: readonly number[];
  readonly count?: number;
  readonly frequency: IcsFrequency;
  /** A positive integer; RFC 5545 defaults it to 1. */
  readonly interval?: number;
  readonly until?: IcsDateValue;
  /** WKST; RFC 5545 defaults it to `MO`. */
  readonly weekStart?: IcsWeekday;
}

/** The decoded type of each value type. */
export interface IcsDecodedValueMap {
  /** Base64 text as written. */
  readonly BINARY: string;
  readonly BOOLEAN: boolean;
  /** The URI as written, such as `mailto:ann@example.com`. */
  readonly "CAL-ADDRESS": string;
  readonly DATE: IcsDate;
  readonly "DATE-TIME": IcsDateTime;
  readonly DURATION: Temporal.Duration;
  readonly FLOAT: number;
  readonly INTEGER: number;
  readonly PERIOD: IcsPeriod;
  readonly RECUR: IcsRecurrenceRule;
  readonly TEXT: string;
  readonly TIME: IcsTime;
  readonly URI: string;
  readonly "UTC-OFFSET": IcsUtcOffset;
}

// ── Components ──────────────────────────────────────────────────────────────────────────────────

/** An open string union: the listed values autocomplete, any other string is accepted. */
export type IcsOpen<T extends string> = T | (string & {});

export type IcsClassification = IcsOpen<"CONFIDENTIAL" | "PRIVATE" | "PUBLIC">;
export type IcsEventStatus = IcsOpen<"CANCELLED" | "CONFIRMED" | "TENTATIVE">;
export type IcsTodoStatus = IcsOpen<"CANCELLED" | "COMPLETED" | "IN-PROCESS" | "NEEDS-ACTION">;
export type IcsJournalStatus = IcsOpen<"CANCELLED" | "DRAFT" | "FINAL">;
export type IcsTransparency = IcsOpen<"OPAQUE" | "TRANSPARENT">;

/** ORGANIZER, or the common part of ATTENDEE. */
export interface IcsCalendarUser {
  /** The CAL-ADDRESS as written, such as `mailto:ann@example.com`. */
  readonly address: string;
  /** DIR. */
  readonly directory?: string;
  /** The EMAIL parameter (RFC 7986), else the address without `mailto:`, when it has one. */
  readonly email?: string;
  /** LANGUAGE. */
  readonly language?: string;
  /** CN. */
  readonly name?: string;
  /** Parameters no field maps, such as `X-NUM-GUESTS` or `SCHEDULE-STATUS`. */
  readonly otherParameters: IcsParameters;
  /** SENT-BY. */
  readonly sentBy?: string;
}

export interface IcsAttendee extends IcsCalendarUser {
  /** CUTYPE. */
  readonly calendarUserType?: IcsOpen<"GROUP" | "INDIVIDUAL" | "RESOURCE" | "ROOM" | "UNKNOWN">;
  /** DELEGATED-FROM. */
  readonly delegatedFrom: readonly string[];
  /** DELEGATED-TO. */
  readonly delegatedTo: readonly string[];
  /** MEMBER. */
  readonly memberOf: readonly string[];
  /** PARTSTAT. */
  readonly participationStatus?: IcsOpen<
    | "ACCEPTED"
    | "COMPLETED"
    | "DECLINED"
    | "DELEGATED"
    | "IN-PROCESS"
    | "NEEDS-ACTION"
    | "TENTATIVE"
  >;
  /** ROLE. */
  readonly role?: IcsOpen<"CHAIR" | "NON-PARTICIPANT" | "OPT-PARTICIPANT" | "REQ-PARTICIPANT">;
  /** RSVP; absent when the parameter is. */
  readonly rsvp?: boolean;
}

/** ATTACH: a URI, or inline base64 data (`ENCODING=BASE64;VALUE=BINARY`). */
export type IcsAttachment =
  | { readonly formatType?: string; readonly kind: "uri"; readonly uri: string }
  | { readonly data: string; readonly formatType?: string; readonly kind: "binary" };

/** CONFERENCE (RFC 7986). */
export interface IcsConference {
  /** FEATURE, such as `AUDIO`, `VIDEO` or `PHONE`. */
  readonly features: readonly string[];
  /** LABEL. */
  readonly label?: string;
  readonly uri: string;
}

/** GEO. */
export interface IcsGeo {
  readonly latitude: number;
  readonly longitude: number;
}

/** RELATED-TO. */
export interface IcsRelation {
  /** RELTYPE; RFC 5545 defaults it to `PARENT`. */
  readonly relationship?: IcsOpen<"CHILD" | "PARENT" | "SIBLING">;
  readonly uid: string;
}

/** TRIGGER: relative to the start or end of its component, or an absolute instant. */
export type IcsAlarmTrigger =
  | { readonly kind: "absolute"; readonly instant: Temporal.Instant }
  | {
      readonly kind: "relative";
      readonly offset: Temporal.Duration;
      /** RELATED; RFC 5545 defaults it to `START`. */
      readonly relatedTo: "END" | "START";
    };

/** VALARM. */
export interface IcsAlarm {
  readonly action: IcsOpen<"AUDIO" | "DISPLAY" | "EMAIL">;
  readonly attachments: readonly IcsAttachment[];
  readonly attendees: readonly IcsAttendee[];
  readonly description?: string;
  /** DURATION between repeats. */
  readonly duration?: Temporal.Duration;
  readonly otherComponents: readonly IcsComponent[];
  readonly otherProperties: readonly IcsProperty[];
  /** REPEAT. */
  readonly repeat?: number;
  readonly summary?: string;
  readonly trigger: IcsAlarmTrigger;
  /** UID (RFC 9074). */
  readonly uid?: string;
}

/** The properties VEVENT, VTODO and VJOURNAL share. */
export interface IcsSchedulingFields {
  readonly attachments: readonly IcsAttachment[];
  readonly attendees: readonly IcsAttendee[];
  readonly categories: readonly string[];
  /** CLASS. */
  readonly classification?: IcsClassification;
  /** COLOR (RFC 7986): a CSS3 color name. */
  readonly color?: string;
  /** COMMENT, every occurrence. */
  readonly comments: readonly string[];
  /** CONTACT, every occurrence. */
  readonly contacts: readonly string[];
  /** CREATED, in UTC. */
  readonly created?: Temporal.Instant;
  readonly description?: string;
  /** EXDATE, every value of every occurrence. */
  readonly exceptionDates: readonly IcsDateValue[];
  /** LAST-MODIFIED, in UTC. */
  readonly lastModified?: Temporal.Instant;
  readonly organizer?: IcsCalendarUser;
  /** Properties no typed field or extension claims, in source order, including `X-` ones. */
  readonly otherProperties: readonly IcsProperty[];
  /** RDATE, every value of every occurrence. */
  readonly recurrenceDates: readonly (IcsDateValue | IcsPeriod)[];
  /** RECURRENCE-ID: this component overrides that occurrence of the series with its UID. */
  readonly recurrenceId?: IcsDateValue;
  /** RANGE on RECURRENCE-ID. */
  readonly recurrenceRange?: "THISANDFUTURE";
  /** RRULE. RFC 5545 allows one; any further RRULE is reported and skipped. */
  readonly recurrenceRule?: IcsRecurrenceRule;
  readonly relatedTo: readonly IcsRelation[];
  /** SEQUENCE. */
  readonly sequence?: number;
  /** DTSTAMP, in UTC. Required by RFC 5545, but often missing from exports. */
  readonly stamp?: Temporal.Instant;
  readonly summary?: string;
  readonly uid: string;
  readonly url?: string;
}

/** VEVENT. `TExtensions` is the parser's `extensions` option, as for `IcsCalendar`. */
export interface IcsEvent<
  TExtensions extends IcsExtensionsConfig = {},
> extends IcsSchedulingFields {
  readonly alarms: readonly IcsAlarm[];
  readonly conferences: readonly IcsConference[];
  /**
   * DURATION as written; a negative one, which RFC 5545 doesn't allow, is kept and reported. Use
   * `getEventEnd` for the effective end.
   */
  readonly duration?: Temporal.Duration;
  /** DTEND as written. Use `getEventEnd` for the effective end. */
  readonly end?: IcsDateValue;
  readonly extensions: IcsExtensionValues<TExtensions["event"]>;
  readonly geo?: IcsGeo;
  readonly location?: string;
  readonly otherComponents: readonly IcsComponent[];
  /** 0 (undefined) to 9 (lowest). */
  readonly priority?: number;
  readonly resources: readonly string[];
  /** DTSTART. An event without one is reported and skipped. */
  readonly start: IcsDateValue;
  readonly status?: IcsEventStatus;
  /** TRANSP. */
  readonly transparency?: IcsTransparency;
}

/** VTODO. `TExtensions` is the parser's `extensions` option, as for `IcsCalendar`. */
export interface IcsTodo<TExtensions extends IcsExtensionsConfig = {}> extends IcsSchedulingFields {
  readonly alarms: readonly IcsAlarm[];
  /** COMPLETED, in UTC. */
  readonly completed?: Temporal.Instant;
  readonly conferences: readonly IcsConference[];
  /** DUE. */
  readonly due?: IcsDateValue;
  readonly duration?: Temporal.Duration;
  readonly extensions: IcsExtensionValues<TExtensions["todo"]>;
  readonly geo?: IcsGeo;
  readonly location?: string;
  readonly otherComponents: readonly IcsComponent[];
  /** PERCENT-COMPLETE. */
  readonly percentComplete?: number;
  readonly priority?: number;
  readonly resources: readonly string[];
  /** DTSTART. */
  readonly start?: IcsDateValue;
  readonly status?: IcsTodoStatus;
}

/** VJOURNAL. `TExtensions` is the parser's `extensions` option, as for `IcsCalendar`. */
export interface IcsJournal<
  TExtensions extends IcsExtensionsConfig = {},
> extends IcsSchedulingFields {
  readonly extensions: IcsExtensionValues<TExtensions["journal"]>;
  readonly otherComponents: readonly IcsComponent[];
  /** DTSTART. */
  readonly start?: IcsDateValue;
  readonly status?: IcsJournalStatus;
}

/** FREEBUSY: periods of one type. */
export interface IcsFreeBusyPeriods {
  readonly periods: readonly IcsPeriod[];
  /** FBTYPE; RFC 5545 defaults it to `BUSY`. */
  readonly type: IcsOpen<"BUSY" | "BUSY-TENTATIVE" | "BUSY-UNAVAILABLE" | "FREE">;
}

/** VFREEBUSY. */
export interface IcsFreeBusy {
  readonly attendees: readonly IcsAttendee[];
  readonly comments: readonly string[];
  readonly contact?: string;
  /** DTEND. */
  readonly end?: IcsDateValue;
  readonly freeBusy: readonly IcsFreeBusyPeriods[];
  readonly organizer?: IcsCalendarUser;
  readonly otherComponents: readonly IcsComponent[];
  readonly otherProperties: readonly IcsProperty[];
  /** DTSTAMP. */
  readonly stamp?: Temporal.Instant;
  /** DTSTART. */
  readonly start?: IcsDateValue;
  readonly uid: string;
  readonly url?: string;
}

/** STANDARD or DAYLIGHT inside a VTIMEZONE. */
export interface IcsTimeZoneObservance {
  readonly comments: readonly string[];
  readonly kind: "daylight" | "standard";
  /** TZNAME, every occurrence. */
  readonly names: readonly string[];
  /** TZOFFSETFROM. */
  readonly offsetFrom: IcsUtcOffset;
  /** TZOFFSETTO. */
  readonly offsetTo: IcsUtcOffset;
  readonly otherProperties: readonly IcsProperty[];
  /** RDATE. */
  readonly recurrenceDates: readonly (IcsDateValue | IcsPeriod)[];
  readonly recurrenceRule?: IcsRecurrenceRule;
  /** DTSTART: a local wall time in the offset before the onset. */
  readonly start: Temporal.PlainDateTime;
}

/** VTIMEZONE. */
export interface IcsTimeZone {
  readonly lastModified?: Temporal.Instant;
  readonly observances: readonly IcsTimeZoneObservance[];
  readonly otherComponents: readonly IcsComponent[];
  readonly otherProperties: readonly IcsProperty[];
  /** The time zone the TZID resolved to, if any: an IANA id or a `±HH:MM` offset. */
  readonly timeZone?: string;
  /** TZID as written. */
  readonly tzid: string;
  /** TZURL. */
  readonly url?: string;
}

/**
 * VCALENDAR. `TExtensions` is the parser's `extensions` option, the same argument every component
 * type takes: `IcsCalendar<typeof config>`, `IcsEvent<typeof config>`.
 */
export interface IcsCalendar<TExtensions extends IcsExtensionsConfig = {}> {
  /** CALSCALE; RFC 5545 defaults it to `GREGORIAN`. */
  readonly calendarScale?: string;
  /** COLOR (RFC 7986). */
  readonly color?: string;
  /** DESCRIPTION (RFC 7986), else `X-WR-CALDESC`. */
  readonly description?: string;
  readonly events: readonly IcsEvent<TExtensions>[];
  readonly extensions: IcsExtensionValues<TExtensions["calendar"]>;
  readonly freeBusy: readonly IcsFreeBusy[];
  readonly journals: readonly IcsJournal<TExtensions>[];
  readonly lastModified?: Temporal.Instant;
  /** METHOD, such as `PUBLISH`, `REQUEST` or `CANCEL` (iTIP). */
  readonly method?: string;
  /** NAME (RFC 7986), else `X-WR-CALNAME`. */
  readonly name?: string;
  readonly otherComponents: readonly IcsComponent[];
  readonly otherProperties: readonly IcsProperty[];
  /** PRODID. */
  readonly productId?: string;
  /** REFRESH-INTERVAL (RFC 7986), else `X-PUBLISHED-TTL`. */
  readonly refreshInterval?: Temporal.Duration;
  /** SOURCE (RFC 7986). */
  readonly source?: string;
  /**
   * `X-WR-TIMEZONE`, resolved to a time zone id: the zone the publisher meant for floating
   * times. Floating values stay floating; apply it yourself if you want it.
   */
  readonly timeZone?: string;
  readonly timeZones: readonly IcsTimeZone[];
  readonly todos: readonly IcsTodo<TExtensions>[];
  /** UID (RFC 7986). */
  readonly uid?: string;
  /** URL (RFC 7986). */
  readonly url?: string;
  readonly version?: string;
}

// ── Extensions ──────────────────────────────────────────────────────────────────────────────────

/** What an extension property's raw value is decoded to before its schema sees it. */
export type IcsExtensionInput<TType extends IcsValueType> = TType extends "DATE" | "DATE-TIME"
  ? IcsDateValue
  : IcsDecodedValueMap[TType];

/** A typed property read into `extensions`. Build one with `icsExtension`. */
export interface IcsExtension<TOutput = unknown> {
  /** Collects every occurrence and every comma-separated value into an array. */
  readonly multiple: boolean;
  /** Upper-cased property name. */
  readonly name: string;
  /** Validates or transforms each decoded value. Must validate synchronously. */
  readonly schema: StandardSchemaV1 | undefined;
  /** The value type the raw value is decoded as, whatever its VALUE parameter says. */
  readonly type: IcsValueType;
  /** Type-level only: the value type in `extensions`. */
  readonly "~output"?: TOutput;
}

export type IcsExtensionMap = Readonly<Record<string, IcsExtension>>;

/** Extension properties per component, keyed by the field name they get in `extensions`. */
export interface IcsExtensionsConfig {
  readonly calendar?: IcsExtensionMap;
  readonly event?: IcsExtensionMap;
  readonly journal?: IcsExtensionMap;
  readonly todo?: IcsExtensionMap;
}

/** The `extensions` object that an extension map produces. */
export type IcsExtensionValues<TMap> = TMap extends IcsExtensionMap
  ? { readonly [K in keyof TMap]: TMap[K] extends IcsExtension<infer TOutput> ? TOutput : never }
  : {};

// ── Parsing ─────────────────────────────────────────────────────────────────────────────────────

/**
 * A TZID resolver: a time zone id Temporal knows (an IANA id or a `±HH:MM` offset), or `undefined`
 * to fall through to the built-in rules. An id Temporal doesn't know is treated like `undefined`.
 */
export type IcsTimeZoneResolver = (
  tzid: string,
  /** The calendar's VTIMEZONE with this TZID, if it has one. */
  definition: IcsComponent | undefined,
) => string | undefined;

/**
 * Bad data becomes issues; only `strict` turns them into an `IcsParseError`. An exception thrown by
 * a callback you pass, `resolveTimeZone` or an extension schema's `validate`, propagates out of
 * `parse` as it is: it is a bug in your code, not in the text.
 */
export interface IcsParseOptions<TExtensions extends IcsExtensionsConfig = {}> {
  readonly extensions?: TExtensions;
  /** Consulted before the built-in TZID rules. */
  readonly resolveTimeZone?: IcsTimeZoneResolver;
  /** Throw `IcsParseError` when any error-severity issue is found. Default `false`. */
  readonly strict?: boolean;
}

export interface IcsParseResult<TExtensions extends IcsExtensionsConfig = {}> {
  /** Every VCALENDAR in the text, usually one. Their components keep source order. */
  readonly calendars: readonly IcsCalendar<TExtensions>[];
  readonly issues: readonly IcsIssue[];
}

/**
 * A configured parser. It is also a Standard Schema: `validate` takes the ICS text and fails with
 * the error-severity issues, or succeeds with the parse result.
 */
export interface IcsParser<TExtensions extends IcsExtensionsConfig = {}> extends StandardSchemaV1<
  string,
  IcsParseResult<TExtensions>
> {
  parse(text: string): IcsParseResult<TExtensions>;
}
