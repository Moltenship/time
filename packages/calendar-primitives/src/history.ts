import type {
  CalendarAnnouncementContext,
  CalendarInputMethod,
  EventHistory,
  EventHistoryDirection,
  EventHistoryOutcome,
  EventHistorySnapshot,
  EventId,
  EventSnapshot,
  NormalizedCalendarEvent,
  ResourceId,
} from "@moltenship/calendar-core";

import type { AnyPendingChanges, CalendarInteractionRuntime } from "./interaction";
import { reportCallbackError } from "./report-error";
import type { CalendarStateSource } from "./types";

/** What an undo or redo announcement is built from: the root's announcement context and the step's event. */
export interface CalendarHistoryAnnouncementContext<
  TEvent = unknown,
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
> extends CalendarAnnouncementContext {
  /**
   * The step's event as the calendar shows it, for its title: from the latest events the calendar
   * rendered, which may still be those from before the undo or redo, or from the events the step
   * was checked against. `undefined` when neither has it, as a restored event the events don't
   * include yet.
   */
  readonly event: NormalizedCalendarEvent<TEvent, TEventId, TResourceId> | undefined;
}

/** Builds what a screen reader hears after an undo or a redo; `null` says nothing. */
export type CalendarHistoryAnnouncementBuilder<
  TEvent = unknown,
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
> = (
  outcome: EventHistoryOutcome<TEvent, TEventId, TResourceId>,
  context: CalendarHistoryAnnouncementContext<TEvent, TEventId, TResourceId>,
) => string | null;

/**
 * Localized announcements for undo and redo. The calendar packages ship no text: the registry's
 * calendar source has an English set to copy and translate.
 */
export interface CalendarHistoryMessages<
  TEvent = unknown,
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
> {
  readonly redo: CalendarHistoryAnnouncementBuilder<TEvent, TEventId, TResourceId>;
  readonly undo: CalendarHistoryAnnouncementBuilder<TEvent, TEventId, TResourceId>;
}

/** How a bound history speaks; see `useCalendarHistory`. */
export interface CalendarHistoryOptions<
  TEvent,
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
> {
  /**
   * Speaks each undo and redo outcome through the root's `Announcer`. Read from the latest
   * render; without it, nothing is said.
   */
  readonly messages?: CalendarHistoryMessages<TEvent, TEventId, TResourceId>;
}

/** What an undo or redo button passes on in the proposal's detail. */
export interface CalendarHistoryCommandOptions {
  /** The input the command came from; `"api"` by default. */
  readonly input?: CalendarInputMethod;
}

/** A history bound to a root: its stacks, and undo and redo through the root's pipeline. */
export interface CalendarHistory<
  TEvent,
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
> extends EventHistorySnapshot<TEvent, TEventId, TResourceId> {
  readonly canRedo: boolean;
  readonly canUndo: boolean;
  /** Takes the last undone step forward again; resolves with the outcome. */
  readonly redo: (
    options?: CalendarHistoryCommandOptions,
  ) => Promise<EventHistoryOutcome<TEvent, TEventId, TResourceId>>;
  /** Takes the last step back by proposing its inverse; resolves with the outcome. */
  readonly undo: (
    options?: CalendarHistoryCommandOptions,
  ) => Promise<EventHistoryOutcome<TEvent, TEventId, TResourceId>>;
}

/** What a history binding reads from the latest render each time it undoes or redoes. */
export interface CalendarHistoryBindingOptions<
  TEvent,
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
> extends CalendarHistoryOptions<TEvent, TEventId, TResourceId> {
  /** The events the calendar shows, pending changes included: the root's latest. */
  readonly events: EventSnapshot<TEvent, TEventId, TResourceId>;
}

/**
 * What the server and hydration read: nothing recorded yet. A plain literal, so a bundler drops
 * it from a calendar that doesn't use the history.
 */
const serverSnapshot: EventHistorySnapshot<never, EventId, ResourceId> = {
  future: [],
  latest: null,
  past: [],
  pending: null,
};

/** Whether a change is still validating or saving: a saved one waiting for events is done. */
function isUnsettled(changes: AnyPendingChanges): boolean {
  for (const { phase } of changes.values()) if (phase !== "awaiting-events") return true;
  return false;
}

/**
 * Binds an event history to a root, as a store of `CalendarHistory` values: undo and redo propose
 * the inverse through the root's `proposeEventChange`, against the events `getOptions` gives, and
 * with its `messages` their outcomes are spoken through the root's announcer channel. The
 * snapshot keeps its identity until the history changes; the server snapshot is an empty history.
 * `getOptions` is read whenever a command runs and when it ends, so the binding is made once per
 * root and history.
 */
export function bindCalendarHistory<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
>(
  {
    actions,
    announcements,
    changes,
  }: Pick<CalendarInteractionRuntime, "actions" | "announcements" | "changes">,
  history: EventHistory<TEvent, TEventId, TResourceId>,
  getOptions: () => CalendarHistoryBindingOptions<TEvent, TEventId, TResourceId>,
): CalendarStateSource<CalendarHistory<TEvent, TEventId, TResourceId>> {
  type Events = EventSnapshot<TEvent, TEventId, TResourceId>;
  type Snapshot = EventHistorySnapshot<TEvent, TEventId, TResourceId>;
  type Bound = CalendarHistory<TEvent, TEventId, TResourceId>;

  /**
   * Resolves once no change is validating or saving, after the turn in which the last one ended,
   * so its result has reached `onEventChangeResult` and the history.
   */
  function whenSettled(): Promise<void> | undefined {
    if (!isUnsettled(changes.getSnapshot())) return undefined;
    return new Promise((resolve) => {
      const unsubscribe = changes.subscribe(() => {
        if (isUnsettled(changes.getSnapshot())) return;
        unsubscribe();
        setTimeout(resolve);
      });
    });
  }

  function run(direction: EventHistoryDirection, { input }: CalendarHistoryCommandOptions = {}) {
    // The events the step was checked against, which still show an event the inverse removed.
    let checked: Events | undefined;
    const getEvents = () => {
      const { events } = getOptions();
      checked ??= events;
      return events;
    };
    const context = { getEvents, input, propose: actions.proposeEventChange, whenSettled };
    return history[direction](context).then((outcome) => {
      const { events, messages } = getOptions();
      const build = messages?.[direction];
      if (build !== undefined) {
        const eventId = outcome.status === "empty" ? null : outcome.step.eventId;
        const event = eventId === null ? undefined : (events.get(eventId) ?? checked?.get(eventId));
        try {
          announcements.say((where) => build(outcome, { ...where, event }));
        } catch (error) {
          reportCallbackError(error);
        }
      }
      return outcome;
    });
  }
  const redo = (options?: CalendarHistoryCommandOptions) => run("redo", options);
  const undo = (options?: CalendarHistoryCommandOptions) => run("undo", options);

  const bound = (snapshot: Snapshot): Bound =>
    Object.freeze({
      ...snapshot,
      canRedo: snapshot.future.length > 0,
      canUndo: snapshot.past.length > 0,
      redo,
      undo,
    });
  let held: { readonly bound: Bound; readonly snapshot: Snapshot } | undefined;
  let server: Bound | undefined;

  return Object.freeze({
    getServerSnapshot: () => (server ??= bound(serverSnapshot as unknown as Snapshot)),
    getSnapshot: () => {
      const snapshot = history.getSnapshot();
      if (held?.snapshot !== snapshot) held = { bound: bound(snapshot), snapshot };
      return held.bound;
    },
    subscribe: (listener: () => void) => history.subscribe(listener),
  });
}
