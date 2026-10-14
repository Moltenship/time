import type {
  AnyCalendarView,
  CalendarAnnouncementMessages,
  CalendarClock,
  CalendarContextValue,
  CalendarDiagnostic,
  CalendarEventChange,
  CalendarEventChangeHandler,
  CalendarEventProposal,
  CalendarFactory,
  CalendarFocus,
  CalendarMeta,
  CalendarPendingChanges,
  CalendarProposalDetail,
  CalendarPublicState,
  CalendarRootProps,
  CalendarSelection,
  CalendarSemanticActions,
  CalendarTransactionResult,
  EventId,
  ResourceId,
} from "@moltenship/calendar";
import {
  StrictMode,
  act,
  createElement,
  useLayoutEffect,
  useSyncExternalStore,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";

import { applyCanonicalChange, type ApplyChangeOptions } from "./changes";
import {
  createTestEnvironment,
  toInstant,
  type DateTimeInput,
  type TestEnvironment,
} from "./environment";

/** React's flag for test environments, which tells it to expect `act`. */
const reactGlobals = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };

/**
 * Root props the harness owns; set the others through `rootProps`. The environment's `now`, or
 * the `clock` option, gives the time.
 */
type HarnessOwnedProp =
  | "children"
  | "clock"
  | "events"
  | "now"
  | "onEventChange"
  | "onEventChangeResult";

/** Any other `Root` prop, such as `policies`, `availability` or a controlled `timeZone`. */
export type CalendarHarnessRootProps<
  TEvent,
  TResource,
  TViewDef extends AnyCalendarView,
  TSelection,
  TFocus,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> = Partial<
  Omit<
    CalendarRootProps<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>,
    HarnessOwnedProp
  >
>;

/** An `onEventChangeResult` call, as the harness recorded it. */
export interface CalendarChangeResult<
  TEvent,
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
> {
  readonly detail: CalendarProposalDetail;
  readonly result: CalendarTransactionResult<TEvent, TEventId, TResourceId>;
}

export interface RenderCalendarOptions<
  TEvent,
  TResource,
  TViewDef extends AnyCalendarView,
  TSelection = CalendarSelection,
  TFocus = CalendarFocus,
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
> extends ApplyChangeOptions<TEvent, TEventId, TResourceId> {
  /** The events the calendar starts with. The harness owns them and applies saved changes. */
  readonly events?: readonly TEvent[];
  /** The view to open; the first registered one by default. */
  readonly view?: TViewDef["name"];
  /** `createTestEnvironment()` by default. */
  readonly environment?: TestEnvironment;
  /**
   * A clock `Root` reads the time from instead of the environment's fixed `now`, such as
   * `createTestClock()`. `setNow` doesn't work with one: move the clock.
   */
  readonly clock?: CalendarClock;
  readonly resources?: readonly TResource[];
  /** Renders `Root` without `onEventChange`, so the calendar is read-only. */
  readonly readOnly?: boolean;
  /**
   * Called with each accepted change before the harness applies it. Return a promise to keep the
   * change pending until it settles; throw or reject to roll it back, and the harness applies
   * nothing.
   */
  readonly onEventChange?: CalendarEventChangeHandler<TEvent, TEventId, TResourceId>;
  /** Called after the harness records the result. */
  readonly onEventChangeResult?: (
    result: CalendarTransactionResult<TEvent, TEventId, TResourceId>,
    detail: CalendarProposalDetail,
  ) => void;
  /**
   * Applies a saved change to the events. Defaults to `applyCanonicalChange`, which needs
   * canonical `CalendarEvent` records; pass your own for app records.
   */
  readonly applyChange?: (
    events: readonly TEvent[],
    change: CalendarEventChange<TEvent, TEventId, TResourceId>,
  ) => readonly TEvent[];
  readonly rootProps?: CalendarHarnessRootProps<
    TEvent,
    TResource,
    TViewDef,
    TSelection,
    TFocus,
    TEventId,
    TResourceId
  >;
  /** What `Root` renders; `<Calendar.ActiveView />` by default. */
  readonly children?: ReactNode;
  /** Renders `<Calendar.Announcer messages={messages} />`, so moves are announced. */
  readonly messages?: CalendarAnnouncementMessages;
  /** Wraps the calendar, as a provider it needs does. */
  readonly wrapper?: ComponentType<{ readonly children: ReactNode }>;
  readonly strictMode?: boolean;
  /** `useId`'s prefix, which a server render and its hydration share. */
  readonly identifierPrefix?: string;
  /** Where to render; a new `div` in `document.body` by default, removed on unmount. */
  readonly container?: HTMLElement;
}

/** Options `rerender` changes; the others apply only to the first render. */
export type CalendarHarnessUpdate<
  TEvent,
  TResource,
  TViewDef extends AnyCalendarView,
  TSelection = CalendarSelection,
  TFocus = CalendarFocus,
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
> = Partial<
  Pick<
    RenderCalendarOptions<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>,
    | "applyChange"
    | "children"
    | "createEvent"
    | "events"
    | "messages"
    | "onEventChange"
    | "onEventChangeResult"
    | "readOnly"
    | "resources"
    | "rootProps"
  >
>;

/** What the calendar shows, read from inside `Root` after each render. */
interface Observed<
  TEvent,
  TResource,
  TViewDef extends AnyCalendarView,
  TSelection,
  TFocus,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> {
  readonly context: CalendarContextValue<
    TEvent,
    TResource,
    TViewDef,
    TSelection,
    TFocus,
    TEventId,
    TResourceId
  >;
  readonly pending: CalendarPendingChanges<TEvent, TEventId, TResourceId>;
}

/** A rendered calendar, with what it reported and ways to drive it. */
export interface CalendarHarness<
  TEvent,
  TResource,
  TViewDef extends AnyCalendarView,
  TSelection = CalendarSelection,
  TFocus = CalendarFocus,
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
> {
  readonly container: HTMLElement;
  readonly environment: TestEnvironment;
  /** Every change `onEventChange` received, in order, applied or not. */
  readonly changes: readonly CalendarEventChange<TEvent, TEventId, TResourceId>[];
  /** Every `onEventChangeResult` call, in order. */
  readonly results: readonly CalendarChangeResult<TEvent, TEventId, TResourceId>[];
  /** What `onDiagnosticsChange` last reported. */
  readonly diagnostics: readonly CalendarDiagnostic<TEvent, TEventId>[];
  /** Errors React recovered from, such as a hydration mismatch. */
  readonly recoverableErrors: readonly unknown[];
  /** The calendar's actions, read from inside `Root`. Call them through `act`. */
  readonly actions: CalendarSemanticActions<
    TViewDef["name"],
    TSelection,
    TFocus,
    TResourceId,
    TEvent,
    TEventId
  >;
  /** The events `Root` has now, with every applied change. */
  events(): readonly TEvent[];
  /** The calendar's public state: view, anchor date, time zone, focus and selection. */
  state(): CalendarPublicState<TViewDef["name"], TSelection, TFocus, TResourceId>;
  /** `useCalendarMeta()`: the visible event snapshot, environment, resources and diagnostics. */
  meta(): CalendarMeta<TEvent, TResource, TViewDef, TEventId, TResourceId>;
  /** `useCalendarPendingChanges()`: proposals still validating, saving or awaiting events. */
  pendingChanges(): CalendarPendingChanges<TEvent, TEventId, TResourceId>;
  /** Runs `callback` with the actions inside React's `act`, and waits for what it returns. */
  act<TResult>(
    callback: (
      actions: CalendarSemanticActions<
        TViewDef["name"],
        TSelection,
        TFocus,
        TResourceId,
        TEvent,
        TEventId
      >,
    ) => TResult | PromiseLike<TResult>,
  ): Promise<TResult>;
  /** `proposeEventChange` inside `act`, resolving with its result once it settles. */
  propose(
    proposal: CalendarEventProposal<TEventId, TResourceId, TEvent>,
    detail?: CalendarProposalDetail,
  ): Promise<CalendarTransactionResult<TEvent, TEventId, TResourceId>>;
  /** Replaces the events, as an app's store would. */
  setEvents(events: readonly TEvent[]): Promise<void>;
  /**
   * Moves the fixed `now`, so today and the current time move with it: exact text, a wall time on
   * the environment's zone, or a time such as `"10:00"` on the current date. Throws for a
   * calendar on a `clock`.
   */
  setNow(now: DateTimeInput): Promise<void>;
  /**
   * Renders again with some options changed; `events` replaces the events. `view` and the
   * environment set where the calendar starts, so change those through `act` and its actions.
   */
  rerender(
    options: CalendarHarnessUpdate<
      TEvent,
      TResource,
      TViewDef,
      TSelection,
      TFocus,
      TEventId,
      TResourceId
    >,
  ): Promise<void>;
  unmount(): Promise<void>;
}

/**
 * The harness type for a calendar factory, so tests can name it without its type parameters:
 * `let calendar: CalendarHarnessFor<typeof Calendar>`.
 */
export type CalendarHarnessFor<TCalendar> =
  TCalendar extends CalendarFactory<
    infer TEvent,
    infer TResource,
    infer TViewDef,
    infer TSelection,
    infer TFocus,
    infer TEventId,
    infer TResourceId
  >
    ? CalendarHarness<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>
    : never;

/** The server markup and hydration of `hydrateCalendar`. */
export interface HydratedCalendarHarness<
  TEvent,
  TResource,
  TViewDef extends AnyCalendarView,
  TSelection = CalendarSelection,
  TFocus = CalendarFocus,
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
> extends CalendarHarness<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId> {
  /** What `renderToString` gave, before hydration. */
  readonly serverMarkup: string;
}

/** Thrown when a client render doesn't match the server's markup. */
export class HydrationMismatchError extends Error {
  /** What React reported: recoverable errors and hydration warnings. */
  readonly errors: readonly unknown[];
  readonly serverMarkup: string;

  constructor(errors: readonly unknown[], serverMarkup: string) {
    const reasons = errors.map((error) =>
      error instanceof Error ? error.message : String(error).split("\n")[0],
    );
    super(`Hydration didn't match the server's markup:\n- ${reasons.join("\n- ")}`);
    this.name = "HydrationMismatchError";
    this.errors = errors;
    this.serverMarkup = serverMarkup;
  }
}

interface Mounted {
  unmount(): Promise<void>;
}

const mounted = new Set<Mounted>();

/** Unmounts every calendar the harness rendered and removes the containers it made. */
export async function cleanup(): Promise<void> {
  for (const harness of mounted) await harness.unmount();
}

/** A tiny external store, so the calendar re-renders when the harness changes its inputs. */
function createCell<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  const get = () => value;
  const set = (next: T) => {
    value = next;
    for (const listener of listeners) listener();
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  return { get, set, subscribe };
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

function setUp<
  TEvent,
  TResource,
  TViewDef extends AnyCalendarView,
  TSelection,
  TFocus,
  TEventId extends EventId,
  TResourceId extends ResourceId,
>(
  Calendar: CalendarFactory<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>,
  initialOptions: RenderCalendarOptions<
    TEvent,
    TResource,
    TViewDef,
    TSelection,
    TFocus,
    TEventId,
    TResourceId
  >,
) {
  type Options = RenderCalendarOptions<
    TEvent,
    TResource,
    TViewDef,
    TSelection,
    TFocus,
    TEventId,
    TResourceId
  >;
  type Change = CalendarEventChange<TEvent, TEventId, TResourceId>;
  type Result = CalendarTransactionResult<TEvent, TEventId, TResourceId>;
  type Seen = Observed<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>;

  reactGlobals.IS_REACT_ACT_ENVIRONMENT ??= true;

  const environment = initialOptions.environment ?? createTestEnvironment();
  const initialEvents = initialOptions.events ?? [];
  const options = createCell<Options>(initialOptions);
  const events = createCell<readonly TEvent[]>(initialEvents);
  const now = createCell<Temporal.Instant>(environment.now);
  const changes: Change[] = [];
  const results: CalendarChangeResult<TEvent, TEventId, TResourceId>[] = [];
  let diagnostics: readonly CalendarDiagnostic<TEvent, TEventId>[] = [];
  let observed: Seen | undefined;

  function apply(change: Change) {
    const { applyChange, createEvent } = options.get();
    events.set(
      applyChange === undefined
        ? applyCanonicalChange(events.get(), change, { createEvent })
        : applyChange(events.get(), change),
    );
  }

  const onEventChange = (change: Change): void | Promise<void> => {
    changes.push(change);
    const outcome = options.get().onEventChange?.(change);
    if (isThenable(outcome)) return Promise.resolve(outcome).then(() => apply(change));
    apply(change);
  };
  const onEventChangeResult = (result: Result, detail: CalendarProposalDetail) => {
    results.push(Object.freeze({ detail, result }));
    options.get().onEventChangeResult?.(result, detail);
  };
  const onDiagnosticsChange = (next: readonly CalendarDiagnostic<TEvent, TEventId>[]) => {
    diagnostics = next;
    options.get().rootProps?.onDiagnosticsChange?.(next);
  };

  /** Reads what the calendar shows, from inside `Root`, after each commit. */
  function Observer(): null {
    const context = Calendar.useCalendar();
    const pending = Calendar.useCalendarPendingChanges();
    useLayoutEffect(() => {
      observed = { context, pending };
    });
    return null;
  }

  function Harness(): ReactElement {
    const current = useSyncExternalStore(options.subscribe, options.get, options.get);
    const shown = useSyncExternalStore(events.subscribe, events.get, () => initialEvents);
    const instant = useSyncExternalStore(now.subscribe, now.get, now.get);
    const { children, clock, messages, readOnly, resources, rootProps, view } = current;
    const { now: _now, ...fixed } = environment.rootProps;
    const props = {
      ...fixed,
      defaultView: view ?? Calendar.views[0]?.name,
      ...(resources === undefined ? {} : { resources }),
      ...(clock === undefined ? { now: instant } : { clock }),
      ...rootProps,
      events: shown,
      onDiagnosticsChange,
      onEventChangeResult,
      ...(readOnly ? {} : { onEventChange }),
    } as CalendarRootProps<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>;
    return createElement(
      Calendar.Root,
      props,
      createElement(Observer),
      children ?? createElement(Calendar.ActiveView),
      messages === undefined ? null : createElement(Calendar.Announcer, { messages }),
    );
  }

  function element(): ReactNode {
    const { strictMode, wrapper } = options.get();
    const harness = createElement(Harness);
    const wrapped = wrapper === undefined ? harness : createElement(wrapper, null, harness);
    return strictMode ? createElement(StrictMode, null, wrapped) : wrapped;
  }

  function seen(): Seen {
    if (observed === undefined) throw new Error("The calendar hasn't rendered yet.");
    return observed;
  }

  function harness(
    container: HTMLElement,
    root: Root,
    recoverableErrors: readonly unknown[],
    ownsContainer: boolean,
  ): CalendarHarness<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId> {
    let active = true;
    const entry: Mounted = {
      async unmount() {
        if (!active) return;
        active = false;
        mounted.delete(entry);
        await act(async () => root.unmount());
        if (ownsContainer) container.remove();
      },
    };
    mounted.add(entry);

    const ensureMounted = () => {
      if (!active) throw new Error("The calendar was unmounted.");
    };

    return Object.freeze({
      get actions() {
        return seen().context.actions;
      },
      async act<TResult>(
        callback: (actions: Seen["context"]["actions"]) => TResult | PromiseLike<TResult>,
      ): Promise<TResult> {
        ensureMounted();
        let value: TResult | undefined;
        await act(async () => {
          value = await callback(seen().context.actions);
        });
        return value as TResult;
      },
      changes,
      container,
      get diagnostics() {
        return diagnostics;
      },
      environment,
      events: () => events.get(),
      meta: () => seen().context.meta,
      pendingChanges: () => seen().pending,
      async propose(
        proposal: CalendarEventProposal<TEventId, TResourceId, TEvent>,
        detail?: CalendarProposalDetail,
      ) {
        ensureMounted();
        let result: Result | undefined;
        await act(async () => {
          result = await seen().context.actions.proposeEventChange(proposal, detail);
        });
        return result!;
      },
      recoverableErrors,
      async rerender(next: Partial<Options>) {
        ensureMounted();
        await act(async () => {
          if (next.events !== undefined) events.set(next.events);
          options.set({ ...options.get(), ...next });
        });
      },
      results,
      async setEvents(next: readonly TEvent[]) {
        ensureMounted();
        await act(async () => events.set(next));
      },
      async setNow(next: DateTimeInput) {
        ensureMounted();
        if (options.get().clock !== undefined) {
          throw new Error("This calendar reads a clock: move the clock instead of calling setNow.");
        }
        const { timeZone } = environment;
        const instant =
          typeof next === "string" && /^\d{2}:\d{2}/u.test(next.trim())
            ? now
                .get()
                .toZonedDateTimeISO(timeZone)
                .toPlainDate()
                .toPlainDateTime(Temporal.PlainTime.from(next))
                .toZonedDateTime(timeZone)
                .toInstant()
            : toInstant(next, timeZone);
        await act(async () => now.set(instant));
      },
      state: () => seen().context.state,
      unmount: () => entry.unmount(),
    });
  }

  return { element, harness };
}

function containerFor(options: { readonly container?: HTMLElement }) {
  if (options.container !== undefined) return { container: options.container, owns: false };
  const container = document.createElement("div");
  document.body.append(container);
  return { container, owns: true };
}

/**
 * Renders `Calendar.Root` with a deterministic environment and controlled events, inside `act`.
 * Saved changes are applied to the events; every change and result is recorded. Unmount it with
 * `unmount()`, or every one at once with `cleanup()` after each test.
 */
export async function renderCalendar<
  TEvent,
  TResource,
  TViewDef extends AnyCalendarView,
  TSelection,
  TFocus,
  TEventId extends EventId,
  TResourceId extends ResourceId,
>(
  Calendar: CalendarFactory<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>,
  options: RenderCalendarOptions<
    TEvent,
    TResource,
    TViewDef,
    TSelection,
    TFocus,
    TEventId,
    TResourceId
  > = {},
): Promise<
  CalendarHarness<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>
> {
  const { element, harness } = setUp(Calendar, options);
  const { container, owns } = containerFor(options);
  const recoverableErrors: unknown[] = [];
  const root = createRoot(container, {
    identifierPrefix: options.identifierPrefix,
    onRecoverableError: (error) => recoverableErrors.push(error),
  });
  const rendered = harness(container, root, recoverableErrors, owns);
  await act(async () => root.render(element()));
  return rendered;
}

/** Whether a console message is one of React's hydration warnings. */
function isHydrationWarning(args: readonly unknown[]): boolean {
  return args.some((arg) => typeof arg === "string" && /hydrat/iu.test(arg));
}

/**
 * Renders the calendar with `renderToString`, puts that markup in a container and hydrates it,
 * as a server-rendered page does. Throws a `HydrationMismatchError` when React reports a
 * mismatch: a recoverable error, or a hydration warning such as a differing attribute, which
 * React only logs. The console is watched while hydration runs, then restored; any `console.error`
 * then that mentions hydration counts. React's development build logs those warnings and its
 * production build doesn't, so test with the development build. The server render runs in the
 * test's own environment, so code that checks for `window` takes its browser branch there too.
 */
export async function hydrateCalendar<
  TEvent,
  TResource,
  TViewDef extends AnyCalendarView,
  TSelection,
  TFocus,
  TEventId extends EventId,
  TResourceId extends ResourceId,
>(
  Calendar: CalendarFactory<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>,
  options: RenderCalendarOptions<
    TEvent,
    TResource,
    TViewDef,
    TSelection,
    TFocus,
    TEventId,
    TResourceId
  > = {},
): Promise<
  HydratedCalendarHarness<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>
> {
  const { element, harness } = setUp(Calendar, options);
  const serverMarkup = renderToString(element(), { identifierPrefix: options.identifierPrefix });
  const { container, owns } = containerFor(options);
  container.innerHTML = serverMarkup;
  const problems: unknown[] = [];
  const recoverableErrors: unknown[] = [];
  const consoleError = console.error;
  let root: Root | undefined;
  console.error = (...args: unknown[]) => {
    if (isHydrationWarning(args)) problems.push(args.map(String).join(" "));
    consoleError.apply(console, args);
  };
  try {
    await act(async () => {
      root = hydrateRoot(container, element(), {
        identifierPrefix: options.identifierPrefix,
        onRecoverableError: (error) => {
          recoverableErrors.push(error);
          problems.push(error);
        },
      });
    });
  } catch (error) {
    // A component threw while hydrating: leave nothing mounted behind.
    try {
      await act(async () => root?.unmount());
    } catch {
      // The root may already be gone with its error.
    }
    if (owns) container.remove();
    throw error;
  } finally {
    console.error = consoleError;
  }
  const hydrated = harness(container, root!, recoverableErrors, owns);
  if (problems.length > 0) {
    await hydrated.unmount();
    throw new HydrationMismatchError(problems, serverMarkup);
  }
  // A copy that keeps the harness's getters live.
  return Object.freeze(
    Object.defineProperties(
      { serverMarkup },
      Object.getOwnPropertyDescriptors(hydrated),
    ) as HydratedCalendarHarness<
      TEvent,
      TResource,
      TViewDef,
      TSelection,
      TFocus,
      TEventId,
      TResourceId
    >,
  );
}
