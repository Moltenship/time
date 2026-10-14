# @moltenship/calendar-testing API report

Made by `vp run release:api:update` from the built declarations. Don't edit it by hand. When the public API changes on purpose, regenerate the report and review its diff with the change.

## `@moltenship/calendar-testing`

```ts
import {
  AllDayCalendarEvent,
  AnyCalendarView,
  CalendarAnnouncementMessages,
  CalendarAvailability,
  CalendarClock,
  CalendarDiagnostic,
  CalendarDirection,
  CalendarEvent,
  CalendarEventChange,
  CalendarEventChangeHandler,
  CalendarEventProposal,
  CalendarFactory,
  CalendarFocus,
  CalendarMeta,
  CalendarPendingChanges,
  CalendarProposalDetail,
  CalendarPublicState,
  CalendarResource,
  CalendarRootProps,
  CalendarSelection,
  CalendarSemanticActions,
  CalendarTransactionResult,
  CalendarWeekRules,
  EventId,
  IsoDayOfWeek,
  ResourceAvailability,
  ResourceId,
  TimedCalendarEvent,
} from "@moltenship/calendar";
import {
  ComponentType,
  ReactNode,
} from "react";
import {
  RecurrenceDate,
  RecurrencePeriod,
  RecurrenceRule,
  RecurringCalendarEvent,
} from "@moltenship/calendar-recurrence";

interface AllDayEventInput<TData = null, TEventId extends EventId = string, TResourceId extends ResourceId = string> extends EventBaseInput<TData, TEventId, TResourceId> {
  readonly start?: DateInput;
  readonly end?: DateInput;
  readonly days?: number;
}
interface ApplyChangeOptions<TEvent, TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId> {
  readonly createEvent?: (change: Extract<CalendarEventChange<TEvent, TEventId, TResourceId>, {
    cause: "create";
  }>, id: string) => TEvent;
}
interface AvailabilityExceptionInput {
  readonly date: DateInput;
  readonly hours?: HoursInput | readonly HoursInput[];
  readonly label?: string;
}
interface AvailabilityInput {
  readonly days?: readonly IsoDayOfWeek[];
  readonly hours?: HoursInput | readonly HoursInput[];
  readonly exceptions?: readonly AvailabilityExceptionInput[];
  readonly timeZone?: string;
}
interface CalendarChangeResult<TEvent, TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId> {
  readonly detail: CalendarProposalDetail;
  readonly result: CalendarTransactionResult<TEvent, TEventId, TResourceId>;
}
interface CalendarHarness<TEvent, TResource, TViewDef extends AnyCalendarView, TSelection = CalendarSelection, TFocus = CalendarFocus, TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId> {
  readonly container: HTMLElement;
  readonly environment: TestEnvironment;
  readonly changes: readonly CalendarEventChange<TEvent, TEventId, TResourceId>[];
  readonly results: readonly CalendarChangeResult<TEvent, TEventId, TResourceId>[];
  readonly diagnostics: readonly CalendarDiagnostic<TEvent, TEventId>[];
  readonly recoverableErrors: readonly unknown[];
  readonly actions: CalendarSemanticActions<TViewDef["name"], TSelection, TFocus, TResourceId, TEvent, TEventId>;
  events(): readonly TEvent[];
  state(): CalendarPublicState<TViewDef["name"], TSelection, TFocus, TResourceId>;
  meta(): CalendarMeta<TEvent, TResource, TViewDef, TEventId, TResourceId>;
  pendingChanges(): CalendarPendingChanges<TEvent, TEventId, TResourceId>;
  act<TResult>(callback: (actions: CalendarSemanticActions<TViewDef["name"], TSelection, TFocus, TResourceId, TEvent, TEventId>) => TResult | PromiseLike<TResult>): Promise<TResult>;
  propose(proposal: CalendarEventProposal<TEventId, TResourceId, TEvent>, detail?: CalendarProposalDetail): Promise<CalendarTransactionResult<TEvent, TEventId, TResourceId>>;
  setEvents(events: readonly TEvent[]): Promise<void>;
  setNow(now: DateTimeInput): Promise<void>;
  rerender(options: CalendarHarnessUpdate<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>): Promise<void>;
  unmount(): Promise<void>;
}
type CalendarHarnessFor<TCalendar> = TCalendar extends CalendarFactory<infer TEvent, infer TResource, infer TViewDef, infer TSelection, infer TFocus, infer TEventId, infer TResourceId> ? CalendarHarness<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId> : never;
type CalendarHarnessRootProps<TEvent, TResource, TViewDef extends AnyCalendarView, TSelection, TFocus, TEventId extends EventId, TResourceId extends ResourceId> = Partial<Omit<CalendarRootProps<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>, HarnessOwnedProp>>;
type CalendarHarnessUpdate<TEvent, TResource, TViewDef extends AnyCalendarView, TSelection = CalendarSelection, TFocus = CalendarFocus, TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId> = Partial<Pick<RenderCalendarOptions<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>, "applyChange" | "children" | "createEvent" | "events" | "messages" | "onEventChange" | "onEventChangeResult" | "readOnly" | "resources" | "rootProps">>;
type DateInput = Temporal.PlainDate | string;
type DateTimeInput = Temporal.Instant | Temporal.ZonedDateTime | string;
interface EventBaseInput<TData, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly id?: TEventId;
  readonly title?: string;
  readonly resourceIds?: readonly TResourceId[];
  readonly data?: TData;
}
type HarnessOwnedProp = "children" | "clock" | "events" | "now" | "onEventChange" | "onEventChangeResult";
type HoursInput = string | {
  readonly start: Temporal.PlainTime | string;
  readonly end: Temporal.PlainTime | string;
};
interface HydratedCalendarHarness<TEvent, TResource, TViewDef extends AnyCalendarView, TSelection = CalendarSelection, TFocus = CalendarFocus, TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId> extends CalendarHarness<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId> {
  readonly serverMarkup: string;
}
export declare class HydrationMismatchError extends Error {
  readonly errors: readonly unknown[];
  readonly serverMarkup: string;
  constructor(errors: readonly unknown[], serverMarkup: string);
}
interface RecurrenceInput {
  readonly rule?: string | RecurrenceRule;
  readonly exceptionDates?: readonly (RecurrenceDate | string)[];
  readonly recurrenceDates?: readonly (RecurrenceDate | RecurrencePeriod | string)[];
  readonly duration?: Temporal.Duration | string;
}
interface RenderCalendarOptions<TEvent, TResource, TViewDef extends AnyCalendarView, TSelection = CalendarSelection, TFocus = CalendarFocus, TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId> extends ApplyChangeOptions<TEvent, TEventId, TResourceId> {
  readonly events?: readonly TEvent[];
  readonly view?: TViewDef["name"];
  readonly environment?: TestEnvironment;
  readonly clock?: CalendarClock;
  readonly resources?: readonly TResource[];
  readonly readOnly?: boolean;
  readonly onEventChange?: CalendarEventChangeHandler<TEvent, TEventId, TResourceId>;
  readonly onEventChangeResult?: (result: CalendarTransactionResult<TEvent, TEventId, TResourceId>, detail: CalendarProposalDetail) => void;
  readonly applyChange?: (events: readonly TEvent[], change: CalendarEventChange<TEvent, TEventId, TResourceId>) => readonly TEvent[];
  readonly rootProps?: CalendarHarnessRootProps<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>;
  readonly children?: ReactNode;
  readonly messages?: CalendarAnnouncementMessages;
  readonly wrapper?: ComponentType<{
    readonly children: ReactNode;
  }>;
  readonly strictMode?: boolean;
  readonly identifierPrefix?: string;
  readonly container?: HTMLElement;
}
interface ResourceInput<TData = null, TResourceId extends ResourceId = string> {
  readonly id?: TResourceId;
  readonly title?: string;
  readonly parentId?: TResourceId;
  readonly timeZone?: string;
  readonly availability?: ResourceAvailability;
  readonly data?: TData;
}
interface TestClock extends CalendarClock {
  advance(duration: Temporal.DurationLike | string): Temporal.Instant;
  set(instant: DateTimeInput): void;
}
interface TestEnvironment {
  readonly anchorDate: Temporal.PlainDate;
  readonly direction: CalendarDirection;
  readonly locale: string;
  readonly now: Temporal.Instant;
  readonly rootProps: TestEnvironmentRootProps;
  readonly timeZone: string;
  readonly today: Temporal.PlainDate;
  readonly weekRules: CalendarWeekRules;
  at(value: DateTimeInput): Temporal.Instant;
}
interface TestEnvironmentOptions {
  readonly now?: DateTimeInput;
  readonly timeZone?: string;
  readonly locale?: string;
  readonly weekRules?: CalendarWeekRules;
  readonly direction?: CalendarDirection;
  readonly anchorDate?: DateInput;
}
interface TestEnvironmentRootProps {
  readonly defaultAnchorDate: Temporal.PlainDate;
  readonly defaultTimeZone: string;
  readonly direction: CalendarDirection;
  readonly locale: string;
  readonly now: Temporal.Instant;
  readonly weekRules: CalendarWeekRules;
}
interface TimedEventInput<TData = null, TEventId extends EventId = string, TResourceId extends ResourceId = string> extends EventBaseInput<TData, TEventId, TResourceId> {
  readonly start?: DateTimeInput;
  readonly end?: DateTimeInput;
  readonly duration?: Temporal.DurationLike | string;
  readonly timeZone?: string;
}
export declare function applyCanonicalChange<TEvent, TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId>(events: readonly TEvent[], change: CalendarEventChange<TEvent, TEventId, TResourceId>, options?: ApplyChangeOptions<TEvent, TEventId, TResourceId>): readonly TEvent[];
export declare function buildAllDayEvent<TData = null, TEventId extends EventId = string, TResourceId extends ResourceId = string>(input?: AllDayEventInput<TData, TEventId, TResourceId>): AllDayCalendarEvent<NoInfer<TData>, NoInfer<TEventId>, NoInfer<TResourceId>>;
export declare function buildAvailability(input?: AvailabilityInput): CalendarAvailability;
export declare function buildEvent<TData = null, TEventId extends EventId = string, TResourceId extends ResourceId = string>(input?: TimedEventInput<TData, TEventId, TResourceId>): TimedCalendarEvent<NoInfer<TData>, NoInfer<TEventId>, NoInfer<TResourceId>>;
export declare function buildRecurringEvent<TData = null, TEventId extends EventId = string, TResourceId extends ResourceId = string>(input: TimedEventInput<TData, TEventId, TResourceId> & Omit<RecurrenceInput, "duration">): RecurringCalendarEvent<NoInfer<TData>, NoInfer<TEventId>, NoInfer<TResourceId>>;
export declare function buildResource<TData = null, TResourceId extends ResourceId = string>(input?: ResourceInput<TData, TResourceId>): CalendarResource<NoInfer<TData>, NoInfer<TResourceId>>;
export declare function cleanup(): Promise<void>;
export declare function createTestClock(start?: DateTimeInput): TestClock;
export declare function createTestEnvironment(options?: TestEnvironmentOptions): TestEnvironment;
export declare function hydrateCalendar<TEvent, TResource, TViewDef extends AnyCalendarView, TSelection, TFocus, TEventId extends EventId, TResourceId extends ResourceId>(Calendar: CalendarFactory<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>, options?: RenderCalendarOptions<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>): Promise<HydratedCalendarHarness<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>>;
export declare function renderCalendar<TEvent, TResource, TViewDef extends AnyCalendarView, TSelection, TFocus, TEventId extends EventId, TResourceId extends ResourceId>(Calendar: CalendarFactory<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>, options?: RenderCalendarOptions<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>): Promise<CalendarHarness<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>>;
export declare function withRecurrence<TData, TEventId extends EventId, TResourceId extends ResourceId>(event: CalendarEvent<TData, TEventId, TResourceId>, recurrence: RecurrenceInput): RecurringCalendarEvent<TData, TEventId, TResourceId>;

export {
  type AllDayEventInput,
  type ApplyChangeOptions,
  type AvailabilityExceptionInput,
  type AvailabilityInput,
  type CalendarChangeResult,
  type CalendarHarness,
  type CalendarHarnessFor,
  type CalendarHarnessRootProps,
  type CalendarHarnessUpdate,
  type DateInput,
  type DateTimeInput,
  type HoursInput,
  type HydratedCalendarHarness,
  type RecurrenceInput,
  type RenderCalendarOptions,
  type ResourceInput,
  type TestClock,
  type TestEnvironment,
  type TestEnvironmentOptions,
  type TestEnvironmentRootProps,
  type TimedEventInput,
};
```
