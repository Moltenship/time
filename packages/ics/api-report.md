# @moltenship/ics API report

Made by `vp run release:api:update` from the built declarations. Don't edit it by hand. When the public API changes on purpose, regenerate the report and review its diff with the change.

## `@moltenship/ics`

```ts
interface IcsAlarm {
  readonly action: IcsOpen<"AUDIO" | "DISPLAY" | "EMAIL">;
  readonly attachments: readonly IcsAttachment[];
  readonly attendees: readonly IcsAttendee[];
  readonly description?: string;
  readonly duration?: Temporal.Duration;
  readonly otherComponents: readonly IcsComponent[];
  readonly otherProperties: readonly IcsProperty[];
  readonly repeat?: number;
  readonly summary?: string;
  readonly trigger: IcsAlarmTrigger;
  readonly uid?: string;
}
type IcsAlarmTrigger = {
  readonly kind: "absolute";
  readonly instant: Temporal.Instant;
} | {
  readonly kind: "relative";
  readonly offset: Temporal.Duration;
  readonly relatedTo: "END" | "START";
};
type IcsAttachment = {
  readonly formatType?: string;
  readonly kind: "uri";
  readonly uri: string;
} | {
  readonly data: string;
  readonly formatType?: string;
  readonly kind: "binary";
};
interface IcsAttendee extends IcsCalendarUser {
  readonly calendarUserType?: IcsOpen<"GROUP" | "INDIVIDUAL" | "RESOURCE" | "ROOM" | "UNKNOWN">;
  readonly delegatedFrom: readonly string[];
  readonly delegatedTo: readonly string[];
  readonly memberOf: readonly string[];
  readonly participationStatus?: IcsOpen<"ACCEPTED" | "COMPLETED" | "DECLINED" | "DELEGATED" | "IN-PROCESS" | "NEEDS-ACTION" | "TENTATIVE">;
  readonly role?: IcsOpen<"CHAIR" | "NON-PARTICIPANT" | "OPT-PARTICIPANT" | "REQ-PARTICIPANT">;
  readonly rsvp?: boolean;
}
interface IcsCalendar<TExtensions extends IcsExtensionsConfig = {}> {
  readonly calendarScale?: string;
  readonly color?: string;
  readonly description?: string;
  readonly events: readonly IcsEvent<TExtensions>[];
  readonly extensions: IcsExtensionValues<TExtensions["calendar"]>;
  readonly freeBusy: readonly IcsFreeBusy[];
  readonly journals: readonly IcsJournal<TExtensions>[];
  readonly lastModified?: Temporal.Instant;
  readonly method?: string;
  readonly name?: string;
  readonly otherComponents: readonly IcsComponent[];
  readonly otherProperties: readonly IcsProperty[];
  readonly productId?: string;
  readonly refreshInterval?: Temporal.Duration;
  readonly source?: string;
  readonly timeZone?: string;
  readonly timeZones: readonly IcsTimeZone[];
  readonly todos: readonly IcsTodo<TExtensions>[];
  readonly uid?: string;
  readonly url?: string;
  readonly version?: string;
}
interface IcsCalendarUser {
  readonly address: string;
  readonly directory?: string;
  readonly email?: string;
  readonly language?: string;
  readonly name?: string;
  readonly otherParameters: IcsParameters;
  readonly sentBy?: string;
}
type IcsCheckedSchema<TType extends IcsValueType, TSchema> = TSchema extends StandardSchemaV1 ? IcsSchemaAccepts<StandardSchemaV1.InferInput<TSchema>, IcsExtensionInput<TType>> extends true ? TSchema : StandardSchemaV1<IcsExtensionInput<TType>, StandardSchemaV1.InferOutput<TSchema>> : TSchema;
type IcsClassification = IcsOpen<"CONFIDENTIAL" | "PRIVATE" | "PUBLIC">;
interface IcsComponent {
  readonly components: readonly IcsComponent[];
  readonly line?: number;
  readonly name: string;
  readonly properties: readonly IcsProperty[];
}
interface IcsComponentsResult {
  readonly components: readonly IcsComponent[];
  readonly issues: readonly IcsIssue[];
}
interface IcsConference {
  readonly features: readonly string[];
  readonly label?: string;
  readonly uri: string;
}
interface IcsDate {
  readonly date: Temporal.PlainDate;
  readonly kind: "date";
}
type IcsDateTime = IcsFloatingDateTime | IcsUnresolvedDateTime | IcsUtcDateTime | IcsZonedDateTime;
type IcsDateValue = IcsDate | IcsDateTime;
type IcsDecodeResult<T> = {
  readonly ok: false;
  readonly message: string;
} | {
  readonly ok: true;
  readonly value: T;
  readonly warnings?: readonly IcsValueWarning[];
};
interface IcsDecodedValueMap {
  readonly BINARY: string;
  readonly BOOLEAN: boolean;
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
interface IcsEvent<TExtensions extends IcsExtensionsConfig = {}> extends IcsSchedulingFields {
  readonly alarms: readonly IcsAlarm[];
  readonly conferences: readonly IcsConference[];
  readonly duration?: Temporal.Duration;
  readonly end?: IcsDateValue;
  readonly extensions: IcsExtensionValues<TExtensions["event"]>;
  readonly geo?: IcsGeo;
  readonly location?: string;
  readonly otherComponents: readonly IcsComponent[];
  readonly priority?: number;
  readonly resources: readonly string[];
  readonly start: IcsDateValue;
  readonly status?: IcsEventStatus;
  readonly transparency?: IcsTransparency;
}
type IcsEventStatus = IcsOpen<"CANCELLED" | "CONFIRMED" | "TENTATIVE">;
interface IcsExtension<TOutput = unknown> {
  readonly multiple: boolean;
  readonly name: string;
  readonly schema: StandardSchemaV1 | undefined;
  readonly type: IcsValueType;
  readonly "~output"?: TOutput;
}
type IcsExtensionInput<TType extends IcsValueType> = TType extends "DATE" | "DATE-TIME" ? IcsDateValue : IcsDecodedValueMap[TType];
type IcsExtensionItem<TType extends IcsValueType, TSchema extends StandardSchemaV1 | undefined> = TSchema extends StandardSchemaV1 ? StandardSchemaV1.InferOutput<TSchema> : IcsExtensionInput<TType>;
type IcsExtensionMap = Readonly<Record<string, IcsExtension>>;
interface IcsExtensionOptions<TType extends IcsValueType, TSchema extends StandardSchemaV1 | undefined, TMultiple extends boolean> {
  readonly multiple?: TMultiple;
  readonly schema?: TSchema & NoInfer<IcsCheckedSchema<TType, TSchema>>;
  readonly type?: TType;
}
type IcsExtensionOutput<TType extends IcsValueType, TSchema extends StandardSchemaV1 | undefined, TMultiple extends boolean> = TMultiple extends true ? readonly IcsExtensionItem<TType, TSchema>[] : IcsExtensionItem<TType, TSchema> | undefined;
type IcsExtensionValues<TMap> = TMap extends IcsExtensionMap ? { readonly [K in keyof TMap]: TMap[K] extends IcsExtension<infer TOutput> ? TOutput : never; } : {};
interface IcsExtensionsConfig {
  readonly calendar?: IcsExtensionMap;
  readonly event?: IcsExtensionMap;
  readonly journal?: IcsExtensionMap;
  readonly todo?: IcsExtensionMap;
}
interface IcsFloatingDateTime {
  readonly kind: "floating";
  readonly wallTime: Temporal.PlainDateTime;
}
interface IcsFreeBusy {
  readonly attendees: readonly IcsAttendee[];
  readonly comments: readonly string[];
  readonly contact?: string;
  readonly end?: IcsDateValue;
  readonly freeBusy: readonly IcsFreeBusyPeriods[];
  readonly organizer?: IcsCalendarUser;
  readonly otherComponents: readonly IcsComponent[];
  readonly otherProperties: readonly IcsProperty[];
  readonly stamp?: Temporal.Instant;
  readonly start?: IcsDateValue;
  readonly uid: string;
  readonly url?: string;
}
interface IcsFreeBusyPeriods {
  readonly periods: readonly IcsPeriod[];
  readonly type: IcsOpen<"BUSY" | "BUSY-TENTATIVE" | "BUSY-UNAVAILABLE" | "FREE">;
}
type IcsFrequency = "DAILY" | "HOURLY" | "MINUTELY" | "MONTHLY" | "SECONDLY" | "WEEKLY" | "YEARLY";
interface IcsGeo {
  readonly latitude: number;
  readonly longitude: number;
}
interface IcsIssue {
  readonly code: IcsIssueCode;
  readonly component?: string;
  readonly line?: number;
  readonly message: string;
  readonly path: readonly (number | string)[];
  readonly property?: string;
  readonly severity: IcsIssueSeverity;
}
type IcsIssueCode =
"missing-property" |
"duplicate-property" |
"conflicting-properties" |
"invalid-content-line" |
"invalid-structure" |
"invalid-value" |
"unknown-time-zone" |
"unsupported" |
"schema";
type IcsIssueSeverity = "error" | "warning";
interface IcsJournal<TExtensions extends IcsExtensionsConfig = {}> extends IcsSchedulingFields {
  readonly extensions: IcsExtensionValues<TExtensions["journal"]>;
  readonly otherComponents: readonly IcsComponent[];
  readonly start?: IcsDateValue;
  readonly status?: IcsJournalStatus;
}
type IcsJournalStatus = IcsOpen<"CANCELLED" | "DRAFT" | "FINAL">;
type IcsOpen<T extends string> = T | (string & {});
type IcsParameters = Readonly<Partial<Record<string, readonly string[]>>>;
export declare class IcsParseError extends Error {
  readonly issues: readonly IcsIssue[];
  constructor(issues: readonly IcsIssue[]);
}
interface IcsParseOptions<TExtensions extends IcsExtensionsConfig = {}> {
  readonly extensions?: TExtensions;
  readonly resolveTimeZone?: IcsTimeZoneResolver;
  readonly strict?: boolean;
}
interface IcsParseResult<TExtensions extends IcsExtensionsConfig = {}> {
  readonly calendars: readonly IcsCalendar<TExtensions>[];
  readonly issues: readonly IcsIssue[];
}
interface IcsParser<TExtensions extends IcsExtensionsConfig = {}> extends StandardSchemaV1<string, IcsParseResult<TExtensions>> {
  parse(text: string): IcsParseResult<TExtensions>;
}
type IcsPeriod = {
  readonly end: IcsDateTime;
  readonly start: IcsDateTime;
} | {
  readonly duration: Temporal.Duration;
  readonly start: IcsDateTime;
};
interface IcsProperty {
  readonly line?: number;
  readonly name: string;
  readonly parameters: IcsParameters;
  readonly value: string;
}
interface IcsRecurrenceRule {
  readonly byDay?: readonly IcsWeekdayNumber[];
  readonly byHour?: readonly number[];
  readonly byMinute?: readonly number[];
  readonly byMonth?: readonly number[];
  readonly byMonthDay?: readonly number[];
  readonly bySecond?: readonly number[];
  readonly bySetPosition?: readonly number[];
  readonly byWeekNumber?: readonly number[];
  readonly byYearDay?: readonly number[];
  readonly count?: number;
  readonly frequency: IcsFrequency;
  readonly interval?: number;
  readonly until?: IcsDateValue;
  readonly weekStart?: IcsWeekday;
}
interface IcsRelation {
  readonly relationship?: IcsOpen<"CHILD" | "PARENT" | "SIBLING">;
  readonly uid: string;
}
interface IcsSchedulingFields {
  readonly attachments: readonly IcsAttachment[];
  readonly attendees: readonly IcsAttendee[];
  readonly categories: readonly string[];
  readonly classification?: IcsClassification;
  readonly color?: string;
  readonly comments: readonly string[];
  readonly contacts: readonly string[];
  readonly created?: Temporal.Instant;
  readonly description?: string;
  readonly exceptionDates: readonly IcsDateValue[];
  readonly lastModified?: Temporal.Instant;
  readonly organizer?: IcsCalendarUser;
  readonly otherProperties: readonly IcsProperty[];
  readonly recurrenceDates: readonly (IcsDateValue | IcsPeriod)[];
  readonly recurrenceId?: IcsDateValue;
  readonly recurrenceRange?: "THISANDFUTURE";
  readonly recurrenceRule?: IcsRecurrenceRule;
  readonly relatedTo: readonly IcsRelation[];
  readonly sequence?: number;
  readonly stamp?: Temporal.Instant;
  readonly summary?: string;
  readonly uid: string;
  readonly url?: string;
}
type IcsSchemaAccepts<TInput, TValue> = unknown extends TInput ? true : [TValue] extends [TInput] ? true : [Extract<TInput, TValue> | Extract<TValue, TInput>] extends [never] ? false : true;
interface IcsTime {
  readonly time: Temporal.PlainTime;
  readonly utc: boolean;
}
interface IcsTimeZone {
  readonly lastModified?: Temporal.Instant;
  readonly observances: readonly IcsTimeZoneObservance[];
  readonly otherComponents: readonly IcsComponent[];
  readonly otherProperties: readonly IcsProperty[];
  readonly timeZone?: string;
  readonly tzid: string;
  readonly url?: string;
}
interface IcsTimeZoneObservance {
  readonly comments: readonly string[];
  readonly kind: "daylight" | "standard";
  readonly names: readonly string[];
  readonly offsetFrom: IcsUtcOffset;
  readonly offsetTo: IcsUtcOffset;
  readonly otherProperties: readonly IcsProperty[];
  readonly recurrenceDates: readonly (IcsDateValue | IcsPeriod)[];
  readonly recurrenceRule?: IcsRecurrenceRule;
  readonly start: Temporal.PlainDateTime;
}
type IcsTimeZoneResolver = (tzid: string,
definition: IcsComponent | undefined) => string | undefined;
interface IcsTodo<TExtensions extends IcsExtensionsConfig = {}> extends IcsSchedulingFields {
  readonly alarms: readonly IcsAlarm[];
  readonly completed?: Temporal.Instant;
  readonly conferences: readonly IcsConference[];
  readonly due?: IcsDateValue;
  readonly duration?: Temporal.Duration;
  readonly extensions: IcsExtensionValues<TExtensions["todo"]>;
  readonly geo?: IcsGeo;
  readonly location?: string;
  readonly otherComponents: readonly IcsComponent[];
  readonly percentComplete?: number;
  readonly priority?: number;
  readonly resources: readonly string[];
  readonly start?: IcsDateValue;
  readonly status?: IcsTodoStatus;
}
type IcsTodoStatus = IcsOpen<"CANCELLED" | "COMPLETED" | "IN-PROCESS" | "NEEDS-ACTION">;
type IcsTransparency = IcsOpen<"OPAQUE" | "TRANSPARENT">;
interface IcsUnresolvedDateTime {
  readonly kind: "unresolved";
  readonly tzid: string;
  readonly wallTime: Temporal.PlainDateTime;
}
interface IcsUtcDateTime {
  readonly instant: Temporal.Instant;
  readonly kind: "utc";
}
type IcsUtcOffset = string;
interface IcsValueContext {
  readonly resolveTimeZone?: (tzid: string) => string | undefined;
  readonly tzid?: string;
}
type IcsValueType = "BINARY" | "BOOLEAN" | "CAL-ADDRESS" | "DATE" | "DATE-TIME" | "DURATION" | "FLOAT" | "INTEGER" | "PERIOD" | "RECUR" | "TEXT" | "TIME" | "URI" | "UTC-OFFSET";
interface IcsValueWarning {
  readonly code: IcsIssueCode;
  readonly message: string;
}
type IcsWeekday = "FR" | "MO" | "SA" | "SU" | "TH" | "TU" | "WE";
interface IcsWeekdayNumber {
  readonly ordinal?: number;
  readonly weekday: IcsWeekday;
}
interface IcsZonedDateTime {
  readonly kind: "zoned";
  readonly tzid: string;
  readonly wallTime: Temporal.PlainDateTime;
  readonly zoned: Temporal.ZonedDateTime;
}
interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly "~standard": StandardSchemaV1.Props<Input, Output>;
}
declare namespace StandardSchemaV1 {
  interface Props<Input = unknown, Output = Input> extends StandardTypedV1.Props<Input, Output> {
    readonly validate: (value: unknown, options?: StandardSchemaV1.Options) => Result<Output> | Promise<Result<Output>>;
  }
  type Result<Output> = SuccessResult<Output> | FailureResult;
  interface SuccessResult<Output> {
    readonly value: Output;
    readonly issues?: undefined;
  }
  interface Options {
    readonly libraryOptions?: Record<string, unknown> | undefined;
  }
  interface FailureResult {
    readonly issues: ReadonlyArray<Issue>;
  }
  interface Issue {
    readonly message: string;
    readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
  }
  interface PathSegment {
    readonly key: PropertyKey;
  }
  interface Types<Input = unknown, Output = Input> extends StandardTypedV1.Types<Input, Output> {}
  type InferInput<Schema extends StandardTypedV1> = StandardTypedV1.InferInput<Schema>;
  type InferOutput<Schema extends StandardTypedV1> = StandardTypedV1.InferOutput<Schema>;
}
interface StandardTypedV1<Input = unknown, Output = Input> {
  readonly "~standard": StandardTypedV1.Props<Input, Output>;
}
declare namespace StandardTypedV1 {
  interface Props<Input = unknown, Output = Input> {
    readonly version: 1;
    readonly vendor: string;
    readonly types?: Types<Input, Output> | undefined;
  }
  interface Types<Input = unknown, Output = Input> {
    readonly input: Input;
    readonly output: Output;
  }
  type InferInput<Schema extends StandardTypedV1> = NonNullable<Schema["~standard"]["types"]>["input"];
  type InferOutput<Schema extends StandardTypedV1> = NonNullable<Schema["~standard"]["types"]>["output"];
}
export declare function createIcsParser<TExtensions extends IcsExtensionsConfig = {}>(options?: IcsParseOptions<TExtensions>): IcsParser<TExtensions>;
export declare function decodeIcsDateValue(raw: string, declared: "DATE" | "DATE-TIME", context?: IcsValueContext): IcsDecodeResult<IcsDateValue>;
export declare function decodeIcsValue<TType extends IcsValueType>(type: TType, raw: string, context?: IcsValueContext): IcsDecodeResult<IcsDecodedValueMap[TType]>;
export declare function decodeIcsValues<TType extends IcsValueType>(type: TType, raw: string, context?: IcsValueContext): IcsDecodeResult<IcsDecodedValueMap[TType]>[];
export declare function encodeIcsValue<TType extends IcsValueType>(type: TType, value: IcsDecodedValueMap[TType]): string;
export declare function getEventEnd(event: Pick<IcsEvent, "duration" | "end" | "start">): IcsDateValue;
export declare function icsExtension<TType extends IcsValueType = "TEXT", TSchema extends StandardSchemaV1 | undefined = undefined, TMultiple extends boolean = false>(name: string, options?: IcsExtensionOptions<TType, TSchema, TMultiple>): IcsExtension<IcsExtensionOutput<TType, TSchema, TMultiple>>;
export declare function icsValueTypeOf(property: IcsProperty): IcsValueType;
export declare function parseIcs<TExtensions extends IcsExtensionsConfig = {}>(text: string, options?: IcsParseOptions<TExtensions>): IcsParseResult<TExtensions>;
export declare function parseIcsComponents(text: string): IcsComponentsResult;
export declare function splitIcsValues(type: IcsValueType, raw: string): string[];
export declare function stringifyIcsComponents(components: IcsComponent | readonly IcsComponent[]): string;

export {
  type IcsAlarm,
  type IcsAlarmTrigger,
  type IcsAttachment,
  type IcsAttendee,
  type IcsCalendar,
  type IcsCalendarUser,
  type IcsClassification,
  type IcsComponent,
  type IcsComponentsResult,
  type IcsConference,
  type IcsDate,
  type IcsDateTime,
  type IcsDateValue,
  type IcsDecodeResult,
  type IcsDecodedValueMap,
  type IcsEvent,
  type IcsEventStatus,
  type IcsExtension,
  type IcsExtensionInput,
  type IcsExtensionMap,
  type IcsExtensionOptions,
  type IcsExtensionOutput,
  type IcsExtensionValues,
  type IcsExtensionsConfig,
  type IcsFloatingDateTime,
  type IcsFreeBusy,
  type IcsFreeBusyPeriods,
  type IcsFrequency,
  type IcsGeo,
  type IcsIssue,
  type IcsIssueCode,
  type IcsIssueSeverity,
  type IcsJournal,
  type IcsJournalStatus,
  type IcsOpen,
  type IcsParameters,
  type IcsParseOptions,
  type IcsParseResult,
  type IcsParser,
  type IcsPeriod,
  type IcsProperty,
  type IcsRecurrenceRule,
  type IcsRelation,
  type IcsSchedulingFields,
  type IcsTime,
  type IcsTimeZone,
  type IcsTimeZoneObservance,
  type IcsTimeZoneResolver,
  type IcsTodo,
  type IcsTodoStatus,
  type IcsTransparency,
  type IcsUnresolvedDateTime,
  type IcsUtcDateTime,
  type IcsUtcOffset,
  type IcsValueContext,
  type IcsValueType,
  type IcsValueWarning,
  type IcsWeekday,
  type IcsWeekdayNumber,
  type IcsZonedDateTime,
  type StandardSchemaV1,
  type StandardTypedV1,
};
```
