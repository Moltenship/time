import {
  applyEventOverlay,
  type CalendarChangeCause,
  type CalendarEventChange,
  type CalendarEventPlacementInput,
  type CalendarEventProposal,
  type CalendarFocus,
  type CalendarProposalDetail,
  type CalendarSelection,
  type CalendarTransactionResult,
  type EventId,
  type ResourceId,
} from "@moltenship/calendar-core";
import { plainDateInterval } from "@moltenship/calendar-temporal";
import {
  definePrimitive,
  type PrimitiveInstance,
  type PropSpec,
  type SlotDefinition,
} from "@ui-sdk/core";

import {
  agentEventLabel,
  createdPlacement,
  describeAgentEvent,
  describeAgentPlacement,
  eventsInRange,
  findEvent,
  movedPlacement,
  parsePlainDate,
  parseTimeZone,
  readAgentInput,
  readEventId,
  readFields,
  readResourceIds,
  type CalendarAgentEvent,
  type CalendarAgentItem,
  type CalendarAgentPlacement,
} from "./agent";
import { clockOf } from "./clock";
import type { CalendarRuntime } from "./runtime";
import { calendarStateSlices } from "./store";
import type { CalendarCommandOptions, CalendarPublicState, CalendarStateSlice } from "./types";
import type { AnyCalendarViewDefinition } from "./views";

// oxlint-disable-next-line typescript/no-explicit-any -- the primitive drives any root's runtime.
type AnyRuntime = CalendarRuntime<any, any, any, any, any, any, any>;
type AnyChange = CalendarEventChange<unknown, EventId, ResourceId>;
type AnyResult = CalendarTransactionResult<unknown, EventId, ResourceId>;

/**
 * A calendar instance's options: the root's runtime, and its six slices as the adapter rendered
 * them, the application's controlled values laid over the calendar store's. The instance holds no
 * state of its own: the store and the application own the slices, and the instance mirrors what
 * the adapter passes in the render that computed it.
 */
export type CalendarPrimitiveOptions<
  TView extends string = string,
  TSelection = CalendarSelection,
  TFocus = CalendarFocus,
  TResourceId extends ResourceId = ResourceId,
> = CalendarPublicState<TView, TSelection, TFocus, TResourceId> & {
  /**
   * Lets an agent delete events. Off by default, since a delete needs a person: an application
   * that turns it on asks one in its bridge's `allow` for each `deleteEvent` step. While it is
   * off, `deleteEvent` isn't among the calendar's actions.
   */
  readonly allowAgentDelete?: boolean;
  /**
   * Names an event for an agent, in the calendar's items and in `query`. The title with when it
   * happens in ISO 8601 by default, which an agent can read back exactly.
   */
  readonly formatAgentEventLabel?: (event: CalendarAgentEvent) => string;
  readonly runtime: AnyRuntime;
};

/** A range of dates an agent asks for; either end defaults to the visible range's. */
export interface CalendarAgentRange {
  /** An ISO date, exclusive. */
  readonly end?: string;
  /** An ISO date. */
  readonly start?: string;
}

/** The event an action acts on, by the ID `listEvents` gives. */
export interface CalendarAgentEventRef {
  readonly eventId: EventId;
}

/** What an agent says about an event beside its placement; it reaches the application unvalidated. */
export interface CalendarAgentEventFields {
  /**
   * Anything else the application understands, as JSON, such as a location or a recurrence edit's
   * scope. It reaches policies and `onEventChange` as the proposal detail's `fields`.
   */
  readonly fields?: Readonly<Record<string, unknown>>;
  /** The event's title, which reaches the application as `fields.title`. */
  readonly title?: string;
}

/** A new event: ISO dates for an all-day event, ISO date-times for a timed one. */
export interface CalendarAgentCreateInput extends CalendarAgentEventFields {
  readonly end: string;
  readonly resourceIds?: readonly ResourceId[];
  readonly start: string;
}

/** An event's new start, keeping its length unless `end` is given, and its new resources. */
export interface CalendarAgentMoveInput extends CalendarAgentEventRef {
  readonly end?: string;
  readonly resourceIds?: readonly ResourceId[];
  readonly start: string;
}

/** An event's new start or new end, one of the two. */
export interface CalendarAgentResizeInput extends CalendarAgentEventRef {
  readonly end?: string;
  readonly start?: string;
}

/** Changes to an event: its fields, its placement, or both, as one `"update"`. */
export interface CalendarAgentUpdateInput extends CalendarAgentEventRef, CalendarAgentEventFields {
  readonly end?: string;
  readonly resourceIds?: readonly ResourceId[];
  readonly start?: string;
}

/**
 * Where a change an agent proposed is: still `validating` or `saving`, `saved`, or `rejected` with
 * its reason. A step returns it at once, and `getChange` reads it again later by `changeId`.
 */
export interface CalendarAgentChange {
  readonly cause: CalendarChangeCause;
  readonly changeId: string;
  /** `null` for a new event, whose ID the application gives it when it saves it. */
  readonly eventId: EventId | null;
  /** Where the event would land, in `listEvents`' terms; `null` for a delete. */
  readonly proposed: CalendarAgentPlacement | null;
  readonly reason?: string;
  readonly status: "rejected" | "saved" | "saving" | "validating";
}

/** The calendar as `describeCalendar` returns it: what an agent needs before it acts. */
export interface CalendarAgentDescription {
  /** The actions the calendar takes now, each with the one JSON object it takes. */
  readonly actions: Readonly<Record<string, string>>;
  readonly anchorDate: string;
  /** Whether `deleteEvent` is among the actions. */
  readonly canDelete: boolean;
  /** How the calendar's dates and times read, for an agent that has no other description. */
  readonly conventions: string;
  readonly locale: string;
  /** The current time in the calendar's time zone, ISO 8601 with its offset. */
  readonly now: string;
  /** Changes still being decided or saved, a person's and an agent's. */
  readonly pendingChanges: readonly CalendarAgentChange[];
  /** The calendar takes no event changes: it has no `onEventChange`. */
  readonly readOnly: boolean;
  readonly resources: readonly {
    readonly id: ResourceId;
    readonly parentId: ResourceId | null;
    readonly title: string;
  }[];
  readonly selectedEventId: EventId | null;
  readonly timeZone: string;
  readonly today: string;
  readonly view: string;
  readonly views: readonly string[];
  /** The visible dates, `end` exclusive; `null` while the view is unregistered. */
  readonly visibleRange: { readonly end: string; readonly start: string } | null;
}

/**
 * The actions an AI agent calls through ui-sdk's agent bridge. Each takes nothing or one JSON
 * object and checks it, failing with what it expected. The reads return JSON; a change returns
 * where it is at once, as the bridge reports a returned promise only as pending. The event
 * changes are absent while the root is read-only, and `deleteEvent` unless the root allows it.
 */
export interface CalendarAgentApi<TView extends string = string> {
  /** Proposes a new event, as the agent. */
  readonly createEvent?: (input: CalendarAgentCreateInput) => CalendarAgentChange;
  /** Proposes deleting an event, as the agent; only where the root sets `allowAgentDelete`. */
  readonly deleteEvent?: (input: CalendarAgentEventRef) => CalendarAgentChange;
  /** Today, the time zone, the views, the visible range, what the calendar takes now. */
  describeCalendar(): CalendarAgentDescription;
  /** Where a change the agent proposed is now, by the `changeId` its step returned. */
  getChange(input: { readonly changeId: string }): CalendarAgentChange;
  /** Shows the dates around `date`, an ISO date such as `"2026-03-14"`. */
  goToDate(input: { readonly date: string }): void;
  /** The events in a range of dates, the visible range by default, as JSON. */
  listEvents(input?: CalendarAgentRange): readonly CalendarAgentEvent[];
  /** Proposes moving an event, as the agent. */
  readonly moveEvent?: (input: CalendarAgentMoveInput) => CalendarAgentChange;
  navigateNext(): void;
  navigatePrevious(): void;
  navigateToday(): void;
  /** Proposes a new start or end for an event, as the agent. */
  readonly resizeEvent?: (input: CalendarAgentResizeInput) => CalendarAgentChange;
  /** Selects an event, or clears the selection with `null`. */
  selectEvent(input: { readonly eventId: EventId | null }): void;
  /** Shows the dates in `timeZone`, an IANA name such as `"Europe/Berlin"`. */
  setTimeZone(input: { readonly timeZone: string }): void;
  /** Switches to a registered view; any other name fails with the list of views. */
  setView(input: { readonly view: TView }): void;
  /** Proposes changes to an event's fields, its placement or both, as the agent. */
  readonly updateEvent?: (input: CalendarAgentUpdateInput) => CalendarAgentChange;
}

/**
 * What the calendar's parts and its agent call. The agent's actions attribute themselves to the
 * agent; the parts' commands pass on the event and reason of the press that ran them.
 */
export interface CalendarPrimitiveApi<
  TView extends string = string,
> extends CalendarAgentApi<TView> {
  /** A previous, next or today trigger's command. */
  showNext(options?: CalendarCommandOptions): void;
  showPrevious(options?: CalendarCommandOptions): void;
  showToday(options?: CalendarCommandOptions): void;
  /**
   * Switches to the registered view named `view`, as a view switcher does when its value changes;
   * any other value, as a stale option's, changes nothing. Returns whether it asked for the view.
   */
  selectView(view: string, options?: CalendarCommandOptions): boolean;
  /** The names of the registered views. */
  viewNames(): readonly TView[];
  /** The events the active view shows, as `{ value: id, label }`, the agent's items. */
  visibleEvents(): readonly CalendarAgentItem[];
}

/** The calendar's structural parts, each a slot of its primitive. */
export type CalendarSlotName =
  | "next-trigger"
  | "previous-trigger"
  | "root"
  | "title"
  | "today-trigger"
  | "toolbar"
  | "view-switcher"
  | "viewport";

type CalendarSlots<
  TView extends string,
  TSelection,
  TFocus,
  TResourceId extends ResourceId,
> = Record<
  CalendarSlotName,
  SlotDefinition<
    CalendarPublicState<TView, TSelection, TFocus, TResourceId>,
    CalendarPrimitiveApi<TView>,
    object
  >
>;

/** An instance of the calendar primitive, as an adapter creates and drives it. */
export interface CalendarPrimitiveInstance<
  TView extends string = string,
  TSelection = CalendarSelection,
  TFocus = CalendarFocus,
  TResourceId extends ResourceId = ResourceId,
> extends PrimitiveInstance {
  readonly api: CalendarPrimitiveApi<TView>;
  readonly get: () => CalendarPublicState<TView, TSelection, TFocus, TResourceId>;
  readonly types: {
    readonly api: CalendarPrimitiveApi<TView>;
    readonly options: CalendarPrimitiveOptions<TView, TSelection, TFocus, TResourceId>;
    readonly slots: CalendarSlots<TView, TSelection, TFocus, TResourceId>;
    readonly state: CalendarPublicState<TView, TSelection, TFocus, TResourceId>;
  };
}

/**
 * A calendar's ui-sdk primitive, as `createCalendarPrimitive` returns it: what a renderer's
 * `usePrimitive` and `usePart`, or a test's `mount`, take. Declared here rather than inferred, so
 * the calendar's types don't print ui-sdk's internals.
 */
export type CalendarPrimitive<
  TView extends string = string,
  TSelection = CalendarSelection,
  TFocus = CalendarFocus,
  TResourceId extends ResourceId = ResourceId,
> = ((
  initialOptions: CalendarPrimitiveOptions<TView, TSelection, TFocus, TResourceId> & {
    readonly id: string;
  },
) => CalendarPrimitiveInstance<TView, TSelection, TFocus, TResourceId>) & {
  readonly options: Record<string, PropSpec> | undefined;
  readonly slots: CalendarSlots<TView, TSelection, TFocus, TResourceId>;
};

/** What a calendar primitive is made from. */
export interface CalendarPrimitiveConfig<TViewDef extends AnyCalendarViewDefinition> {
  readonly views: readonly TViewDef[];
}

/**
 * What each agent action takes, as `describeCalendar` lists it and the action's errors repeat:
 * ui-sdk's bridge has no way to describe an action's arguments.
 */
const signatures = Object.freeze({
  createEvent:
    "{ start: ISO date or date-time, end: ISO date or date-time, title?: string, resourceIds?: ID[], fields?: object }",
  deleteEvent: "{ eventId: ID }",
  describeCalendar: "nothing",
  getChange: "{ changeId: string }",
  goToDate: "{ date: ISO date }",
  listEvents: "nothing, or { start?: ISO date, end?: ISO date }",
  moveEvent: "{ eventId: ID, start: ISO date or date-time, end?: same, resourceIds?: ID[] }",
  navigateNext: "nothing",
  navigatePrevious: "nothing",
  navigateToday: "nothing",
  resizeEvent: "{ eventId: ID, start?: ISO date or date-time, end?: same }, one of start and end",
  selectEvent: "{ eventId: ID or null }",
  setTimeZone: "{ timeZone: IANA name }",
  setView: "{ view: one of views }",
  updateEvent:
    "{ eventId: ID, title?: string, start?: ISO date or date-time, end?: same, resourceIds?: ID[], fields?: object }",
} satisfies Record<keyof CalendarAgentApi, string>);

/** The methods an agent may call, with JSON arguments. */
export const calendarAgentActions: readonly (keyof CalendarAgentApi)[] = Object.freeze([
  "describeCalendar",
  "listEvents",
  "getChange",
  "navigateNext",
  "navigatePrevious",
  "navigateToday",
  "goToDate",
  "setView",
  "setTimeZone",
  "selectEvent",
  "createEvent",
  "updateEvent",
  "moveEvent",
  "resizeEvent",
  "deleteEvent",
]);

const conventions =
  "Dates are ISO 8601. A time without an offset is wall-clock time in timeZone; with an offset or Z it is that instant. Ranges include start and exclude end. Event IDs are listEvents' id values.";

/** Every change an agent's action makes is the agent's, whatever else runs around it. */
const asAgent: CalendarCommandOptions = Object.freeze({ source: "agent" });
const agentInput: CalendarProposalDetail = Object.freeze({ input: "agent" });
/** How many of an agent's changes `getChange` remembers, per root. */
const changeLogSize = 50;

/**
 * The agent's changes by ID, per root: a framework may make an instance it then throws away, as
 * React's Strict Mode does, so the log outlives any one.
 */
const changeLogs = new WeakMap<AnyRuntime, Map<string, CalendarAgentChange>>();

function changeLogOf(runtime: AnyRuntime): Map<string, CalendarAgentChange> {
  let log = changeLogs.get(runtime);
  if (log === undefined) {
    log = new Map();
    changeLogs.set(runtime, log);
  }
  return log;
}

function remember(runtime: AnyRuntime, change: CalendarAgentChange): CalendarAgentChange {
  const log = changeLogOf(runtime);
  log.delete(change.changeId);
  log.set(change.changeId, change);
  if (log.size > changeLogSize) log.delete(log.keys().next().value!);
  return change;
}

function slicesOf(options: object): CalendarPublicState {
  const slices: Record<string, unknown> = {};
  for (const slice of calendarStateSlices) {
    slices[slice] = (options as Record<CalendarStateSlice, unknown>)[slice];
  }
  return Object.freeze(slices) as unknown as CalendarPublicState;
}

function modelOf(runtime: AnyRuntime) {
  const model = runtime.committed();
  if (model === undefined) throw new Error("calendar-primitive-before-first-derive");
  return model;
}

function agentChange(
  change: AnyChange,
  status: CalendarAgentChange["status"],
  timeZone: string,
  reason?: string,
): CalendarAgentChange {
  return Object.freeze({
    cause: change.cause,
    changeId: change.id,
    eventId: change.eventId,
    proposed: change.proposed === null ? null : describeAgentPlacement(change.proposed, timeZone),
    ...(reason === undefined ? {} : { reason }),
    status,
  });
}

/** Why a change was turned down, with the handler's own message when it threw one. */
function rejection(result: Extract<AnyResult, { readonly status: "rejected" }>): string {
  const message = result.error instanceof Error ? result.error.message : undefined;
  return message === undefined || message === ""
    ? `calendar-event-change-rejected: ${result.reason}`
    : `calendar-event-change-rejected: ${result.reason} (${message})`;
}

/** An action that takes nothing takes an empty object too, as some agents send one. */
function noArguments(action: string, args: readonly unknown[]): void {
  const [first, ...extra] = args;
  if (first === undefined && extra.every((arg) => arg === undefined)) return;
  readAgentInput(action, "nothing", first, {}, extra);
}

/**
 * Defines a calendar's ui-sdk primitive: the six state slices as always-controlled keys, the
 * semantic commands as its api, its chrome as slots, and what an AI agent may see and do. The
 * slices live in the calendar store and the application's props; the instance is a projection of
 * them for parts and agents, and every change goes through the root's store, which tells the
 * application's handlers.
 */
export function createCalendarPrimitive<
  TViewDef extends AnyCalendarViewDefinition,
  TSelection = CalendarSelection,
  TFocus = CalendarFocus,
  TResourceId extends ResourceId = ResourceId,
>(
  config: CalendarPrimitiveConfig<TViewDef>,
): CalendarPrimitive<TViewDef["name"], TSelection, TFocus, TResourceId> {
  type View = TViewDef["name"];
  type Options = CalendarPrimitiveOptions<View, TSelection, TFocus, TResourceId>;
  type State = CalendarPublicState<View, TSelection, TFocus, TResourceId>;

  const viewNames = Object.freeze(config.views.map((view) => view.name as View));
  const registered: ReadonlySet<string> = new Set(viewNames);

  return definePrimitive({
    name: "calendar",
    options: {
      allowAgentDelete: "boolean",
      anchorDate: "value",
      expandedResourceIds: "value",
      focus: "value",
      formatAgentEventLabel: "value",
      runtime: "value",
      selection: "value",
      timeZone: "string",
      view: "string",
    },
    // All six, always: the adapter passes the merged state, so ui-sdk's store never owns a slice.
    controlled: ["anchorDate", "view", "timeZone", "selection", "focus", "expandedResourceIds"],
    state: (options: Options): State => slicesOf(options) as State,
    sync: (options) => slicesOf(options) as Partial<State>,
    // Stateless: it reads the runtime from the newest options on every call, since a framework
    // may create an instance it then throws away, as React's Strict Mode does.
    api: (context): CalendarPrimitiveApi<View> => {
      const runtime = () => context.options().runtime;
      const actions = () => modelOf(runtime()).actions;

      /**
       * The bridge offers an action only while the api has it, so the event changes are getters
       * that hide on a read-only root, and delete unless the root allows it. ui-sdk checks in
       * development that every listed action exists as the instance is made, so they all show
       * until then.
       */
      let made = false;
      queueMicrotask(() => (made = true));
      const canChange = () => !modelOf(runtime()).isReadOnly;
      const canDelete = () => canChange() && context.options().allowAgentDelete === true;
      const offered = <T>(available: () => boolean, method: T): T | undefined =>
        !made || available() ? method : undefined;

      /** The application's events with the changes still pending, as the next render shows them. */
      function currentEvents() {
        const model = modelOf(runtime());
        return applyEventOverlay(model.eventSnapshot, runtime().transactions.getPending());
      }

      /** The state and range the latest commands asked for, before a framework renders them. */
      function latest() {
        const model = modelOf(runtime());
        const current = runtime().latest();
        const state = (current?.state ?? model.state) as State;
        const range = current === undefined ? (model.activeView?.range ?? null) : current.range;
        return { model, range, state };
      }

      function describeEvents(range: ReturnType<typeof latest>["range"]) {
        if (range === null) return [];
        const { model, state } = latest();
        const environment = { ...model.viewEnvironment, timeZone: state.timeZone };
        return eventsInRange(currentEvents(), range, environment).map((event) =>
          describeAgentEvent(event, environment),
        );
      }

      /**
       * Proposes an agent's change once: a refusal the policies or the handler give at once fails
       * the step with its reason, and a change still saving returns where it is. Its outcome
       * reaches `onEventChangeResult` once, and the agent's log, so a late failure is never an
       * unhandled rejection.
       */
      function propose(
        proposal: CalendarEventProposal<EventId, ResourceId, unknown>,
        fields: Readonly<Record<string, unknown>> | undefined,
      ): CalendarAgentChange {
        const root = runtime();
        const timeZone = latest().state.timeZone;
        const detail =
          fields === undefined ? agentInput : Object.freeze({ fields, input: "agent" });
        const outcome = root.proposeNow(proposal, detail as CalendarProposalDetail);
        if (outcome.status === "rejected") {
          if (outcome.change !== undefined) {
            remember(root, agentChange(outcome.change, "rejected", timeZone, outcome.reason));
          }
          throw new Error(rejection(outcome), { cause: outcome.error });
        }
        if (outcome.status === "committed") {
          return remember(root, agentChange(outcome.change, "saved", timeZone));
        }
        void outcome.result.then((result: AnyResult) => {
          const change = result.change ?? outcome.change;
          remember(
            root,
            result.status === "committed"
              ? agentChange(change, "saved", timeZone)
              : agentChange(change, "rejected", timeZone, result.reason),
          );
        });
        return remember(root, agentChange(outcome.change, outcome.phase, timeZone));
      }

      function checkedView(view: unknown): View {
        if (typeof view === "string" && registered.has(view)) return view as View;
        throw new RangeError(
          `calendar-unknown-view: ${JSON.stringify(view)} is not a registered view. Views: ${viewNames
            .map((name) => JSON.stringify(name))
            .join(", ")}`,
        );
      }

      function eventOf(input: { readonly eventId?: unknown }) {
        return findEvent(currentEvents(), readEventId(input.eventId));
      }

      function environment() {
        const { model, state } = latest();
        return { ...model.viewEnvironment, timeZone: state.timeZone };
      }

      const createEvent = (input: unknown, ...extra: unknown[]) => {
        const args = readAgentInput(
          "createEvent",
          signatures.createEvent,
          input,
          {
            end: true,
            fields: false,
            resourceIds: false,
            start: true,
            title: false,
          },
          extra,
        );
        return propose(
          {
            cause: "create",
            proposed: createdPlacement(args.start, args.end, args.resourceIds, environment()),
          },
          readFields(args),
        );
      };

      const updateEvent = (input: unknown, ...extra: unknown[]) => {
        const args = readAgentInput(
          "updateEvent",
          signatures.updateEvent,
          input,
          {
            end: false,
            eventId: true,
            fields: false,
            resourceIds: false,
            start: false,
            title: false,
          },
          extra,
        );
        const { end, fields, resourceIds, start, title } = args;
        if ([end, fields, resourceIds, start, title].every((value) => value === undefined)) {
          throw new TypeError(
            `calendar-agent-invalid-arguments: updateEvent changes something: ${signatures.updateEvent}`,
          );
        }
        const event = eventOf(args);
        const placement: CalendarEventPlacementInput = movedPlacement(
          event,
          args.start ?? event.start,
          args.start === undefined && args.end === undefined ? event.end : args.end,
          environment(),
        );
        return propose(
          {
            cause: "update",
            eventId: event.id,
            proposed:
              args.resourceIds === undefined
                ? placement
                : { ...placement, resourceIds: readResourceIds(args.resourceIds) },
          },
          readFields(args),
        );
      };

      const moveEvent = (input: unknown, ...extra: unknown[]) => {
        const args = readAgentInput(
          "moveEvent",
          signatures.moveEvent,
          input,
          {
            end: false,
            eventId: true,
            resourceIds: false,
            start: true,
          },
          extra,
        );
        const event = eventOf(args);
        const placement = movedPlacement(event, args.start, args.end, environment());
        return propose(
          {
            cause: "move",
            eventId: event.id,
            proposed:
              args.resourceIds === undefined
                ? placement
                : { ...placement, resourceIds: readResourceIds(args.resourceIds) },
          },
          undefined,
        );
      };

      const resizeEvent = (input: unknown, ...extra: unknown[]) => {
        const args = readAgentInput(
          "resizeEvent",
          signatures.resizeEvent,
          input,
          {
            end: false,
            eventId: true,
            start: false,
          },
          extra,
        );
        if ((args.start === undefined) === (args.end === undefined)) {
          throw new TypeError(
            `calendar-agent-invalid-arguments: resizeEvent takes one of start and end: ${signatures.resizeEvent}`,
          );
        }
        const event = eventOf(args);
        const fromStart = args.start !== undefined;
        return propose(
          {
            cause: fromStart ? "resize-start" : "resize-end",
            eventId: event.id,
            proposed: fromStart
              ? movedPlacement(event, args.start, event.end, environment())
              : movedPlacement(event, event.start, args.end, environment()),
          },
          undefined,
        );
      };

      const deleteEvent = (input: unknown, ...extra: unknown[]) => {
        const args = readAgentInput(
          "deleteEvent",
          signatures.deleteEvent,
          input,
          {
            eventId: true,
          },
          extra,
        );
        return propose({ cause: "delete", eventId: eventOf(args).id }, undefined);
      };

      const api = {
        get createEvent() {
          return offered(canChange, createEvent);
        },
        get deleteEvent() {
          return offered(canDelete, deleteEvent);
        },
        describeCalendar(...args: unknown[]): CalendarAgentDescription {
          noArguments("describeCalendar", args);
          const { model, range, state } = latest();
          const { environment: root } = model;
          const now = (root.now ?? clockOf(root).instant()).toZonedDateTimeISO(state.timeZone);
          const available = Object.fromEntries(
            calendarAgentActions
              .filter((action) => typeof api[action] === "function")
              .map((action) => [action, signatures[action]]),
          );
          const selection = state.selection as CalendarSelection | null;
          return Object.freeze({
            actions: Object.freeze(available),
            anchorDate: state.anchorDate.toString(),
            canDelete: canDelete(),
            conventions,
            locale: String(root.locale),
            now: now.toString({ timeZoneName: "never" }),
            pendingChanges: Object.freeze(
              [...runtime().pendingChanges.getSnapshot().values()]
                .filter(({ phase }) => phase !== "awaiting-events")
                .map(({ change, phase }) =>
                  agentChange(
                    change,
                    phase === "validating" ? "validating" : "saving",
                    state.timeZone,
                  ),
                ),
            ),
            readOnly: model.isReadOnly,
            resources: Object.freeze(
              [...model.resourceTree.byId.values()].map((node) =>
                Object.freeze({
                  id: node.id,
                  parentId: node.parentId,
                  title: node.resource.title,
                }),
              ),
            ),
            selectedEventId: selection?.kind === "event" ? selection.eventId : null,
            timeZone: state.timeZone,
            today: now.toPlainDate().toString(),
            view: state.view,
            views: viewNames,
            visibleRange:
              range === null
                ? null
                : Object.freeze({ end: range.end.toString(), start: range.start.toString() }),
          });
        },
        getChange(input: unknown, ...extra: unknown[]): CalendarAgentChange {
          const args = readAgentInput(
            "getChange",
            signatures.getChange,
            input,
            {
              changeId: true,
            },
            extra,
          );
          const root = runtime();
          const known = changeLogOf(root).get(String(args.changeId));
          if (known !== undefined) return known;
          const pending = root.pendingChanges.getSnapshot().get(String(args.changeId));
          if (pending !== undefined) {
            return agentChange(
              pending.change,
              pending.phase === "validating"
                ? "validating"
                : pending.phase === "saving"
                  ? "saving"
                  : "saved",
              latest().state.timeZone,
            );
          }
          const ids = [...changeLogOf(root).keys()].slice(-10).map((id) => JSON.stringify(id));
          throw new RangeError(
            `calendar-agent-unknown-change: no change has the ID ${JSON.stringify(args.changeId)}. Recent changes: ${
              ids.length === 0 ? "none" : ids.join(", ")
            }`,
          );
        },
        goToDate(input: unknown, ...extra: unknown[]) {
          const args = readAgentInput(
            "goToDate",
            signatures.goToDate,
            input,
            { date: true },
            extra,
          );
          actions().setAnchorDate(parsePlainDate(args.date, "date"), asAgent);
        },
        listEvents(input?: unknown, ...extra: unknown[]): readonly CalendarAgentEvent[] {
          const args = readAgentInput(
            "listEvents",
            signatures.listEvents,
            input ?? {},
            {
              end: false,
              start: false,
            },
            extra,
          );
          const visible = latest().range;
          if (args.start === undefined && args.end === undefined) {
            return Object.freeze(describeEvents(visible));
          }
          const start =
            args.start === undefined ? visible?.start : parsePlainDate(args.start, "start");
          const end = args.end === undefined ? visible?.end : parsePlainDate(args.end, "end");
          if (
            start === undefined ||
            end === undefined ||
            Temporal.PlainDate.compare(start, end) >= 0
          ) {
            throw new RangeError(
              `calendar-agent-invalid-range: listEvents takes a start before its end, not ${JSON.stringify(input)}`,
            );
          }
          return Object.freeze(describeEvents(plainDateInterval(start, end)));
        },
        get moveEvent() {
          return offered(canChange, moveEvent);
        },
        navigateNext(...args: unknown[]) {
          noArguments("navigateNext", args);
          actions().navigateNext(asAgent);
        },
        navigatePrevious(...args: unknown[]) {
          noArguments("navigatePrevious", args);
          actions().navigatePrevious(asAgent);
        },
        navigateToday(...args: unknown[]) {
          noArguments("navigateToday", args);
          actions().navigateToday(asAgent);
        },
        get resizeEvent() {
          return offered(canChange, resizeEvent);
        },
        selectEvent(input: unknown, ...extra: unknown[]) {
          const args = readAgentInput(
            "selectEvent",
            signatures.selectEvent,
            input,
            {
              eventId: true,
            },
            extra,
            ["eventId"],
          );
          const selection =
            args.eventId === null ? null : { eventId: eventOf(args).id, kind: "event" as const };
          actions().setSelection(selection as TSelection | null, asAgent);
        },
        selectView(view: string, options?: CalendarCommandOptions) {
          if (!registered.has(view)) return false;
          actions().setView(view as View, options);
          return true;
        },
        setTimeZone(input: unknown, ...extra: unknown[]) {
          const args = readAgentInput(
            "setTimeZone",
            signatures.setTimeZone,
            input,
            {
              timeZone: true,
            },
            extra,
          );
          actions().setTimeZone(parseTimeZone(args.timeZone), asAgent);
        },
        setView(input: unknown, ...extra: unknown[]) {
          const args = readAgentInput("setView", signatures.setView, input, { view: true }, extra);
          actions().setView(checkedView(args.view), asAgent);
        },
        showNext: (options?: CalendarCommandOptions) => actions().navigateNext(options),
        showPrevious: (options?: CalendarCommandOptions) => actions().navigatePrevious(options),
        showToday: (options?: CalendarCommandOptions) => actions().navigateToday(options),
        get updateEvent() {
          return offered(canChange, updateEvent);
        },
        viewNames: () => viewNames,
        visibleEvents(): readonly CalendarAgentItem[] {
          if (runtime().committed() === undefined) return [];
          const { model } = latest();
          const timeZone = latest().state.timeZone;
          const format = context.options().formatAgentEventLabel;
          return describeEvents(latest().range ?? model.activeView?.range ?? null).map((event) =>
            Object.freeze({
              label: format === undefined ? agentEventLabel(event, timeZone) : format(event),
              value: String(event.id),
            }),
          );
        },
      };
      return Object.freeze(api) as unknown as CalendarPrimitiveApi<View>;
    },
    slots: (slot) => ({
      // The frame: an agent reads the calendar's name from it, its `label` or else the title.
      root: slot({}),
      toolbar: slot({}),
      title: slot({}),
      viewport: slot({}),
      "previous-trigger": slot({
        press: ({ api }, event) => api.showPrevious({ event, reason: "previous-press" }),
      }),
      "next-trigger": slot({
        press: ({ api }, event) => api.showNext({ event, reason: "next-press" }),
      }),
      "today-trigger": slot({
        press: ({ api }, event) => api.showToday({ event, reason: "today-press" }),
      }),
      // Its change handler is the adapter's, which calls `selectView` after the element's own
      // handler: ui-sdk listens to `on` events on the element itself, where a framework's
      // delegated handler, as React's `onChange`, runs too late to call `preventDefault()` first.
      "view-switcher": slot({}),
    }),
    agent: {
      actions: [...calendarAgentActions],
      items: (api) => api.visibleEvents(),
    },
  });
}
