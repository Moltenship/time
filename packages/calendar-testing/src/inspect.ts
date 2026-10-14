import type {
  CalendarFocus,
  CalendarMeta,
  CalendarPendingChanges,
  EventId,
  PlainDateInterval,
  ResourceId,
} from "@moltenship/calendar";
import { act } from "react";

import { realNow } from "./real-time";
import { recordAnnouncements } from "./announcements";
import type { DateInput } from "./environment";
import { createKeyboardDriver, type KeyboardDriver } from "./keyboard";
import { summarizePlacement, type EventPlacementSummary } from "./placement";
import { createPointerDriver, type PointerDriver } from "./pointer";
import {
  CalendarQueryError,
  dayCell,
  eventElements,
  findEvent,
  findEvents,
  resourceElements,
  timeColumn,
  type EventQuery,
} from "./queries";

/** A resource: its ID, `null` for the unassigned row, or `{ title }`. */
export type ResourceQuery<TResourceId extends ResourceId = ResourceId> =
  | TResourceId
  | null
  | { readonly title: string };

export interface SettleOptions {
  /** How long to wait, in milliseconds of real time. 5000 by default. */
  readonly timeout?: number;
}

/** Finds what a calendar shows, drives it, and reads what it said. */
export interface CalendarInspection<
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
> {
  /**
   * The first element showing an event, found by its ID, title or start through the calendar's
   * own events, so it holds in any language. Throws when the query names no event, several, or
   * one the view doesn't show.
   */
  getEvent(event: EventQuery<TEventId>): HTMLElement;
  /**
   * Every element showing an event, in document order: one per part the view draws, such as a
   * time grid's day column, a month's week row, or a resource's column.
   */
  getAllEvents(event: EventQuery<TEventId>): HTMLElement[];
  /**
   * The first element showing an event, or `null` when the view doesn't show it or there's no
   * such event. Throws when the query names several events.
   */
  queryEvent(event: EventQuery<TEventId>): HTMLElement | null;
  /**
   * A day's cell, in a resource: a time grid's all-day cell (`data-all-day`), or else a month's
   * day, the first `data-date` element that isn't a timeline's strip.
   */
  getDayCell(date: DateInput, options?: { readonly resourceId?: TResourceId | null }): HTMLElement;
  /**
   * The column of a date's hours in a time grid, a `data-date` element without `data-all-day`, or
   * its strip along a timeline row (`data-axis="inline"`). In a month, which has no hours, that's
   * the day itself.
   */
  getTimeColumn(
    date: DateInput,
    options?: { readonly resourceId?: TResourceId | null },
  ): HTMLElement;
  /** The first element a resource's column or row carries `resourceIdAttributes` on. */
  getResource(resource: ResourceQuery<TResourceId>): HTMLElement;
  /** Where an event shows now, pending changes included, as text. */
  placementOf(event: EventQuery<TEventId>): EventPlacementSummary<TEventId, TResourceId>;
  /**
   * Waits until no change is pending: every proposal validated, saved and in the events. It
   * advances no fake timers: a save that waits on one needs them advanced.
   */
  settled(options?: SettleOptions): Promise<void>;
  /** Every message the `Announcer` spoke, oldest first. */
  announcements(): readonly string[];
  /** What the `Announcer` says now; `undefined` when it's silent or there's none. */
  lastAnnouncement(): string | undefined;
  readonly keyboard: KeyboardDriver<TEventId, TResourceId>;
  readonly pointer: PointerDriver<TEventId, TResourceId>;
}

export interface InspectionContext<TEventId extends EventId, TResourceId extends ResourceId> {
  readonly container: HTMLElement;
  readonly ensureMounted: () => void;
  readonly focus: () => CalendarFocus | null;
  readonly meta: () => CalendarMeta<unknown, unknown, never, TEventId, TResourceId>;
  readonly pending: () => CalendarPendingChanges<unknown, TEventId, TResourceId>;
  readonly setFocus: (focus: CalendarFocus | null) => void;
  /** The active view's visible dates; `null` when it's unregistered. */
  readonly visibleRange: () => PlainDateInterval | null;
}

/** A macrotask that fake timers don't hold back where `MessageChannel` exists. */
function tick(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof MessageChannel !== "function") {
      setTimeout(resolve, 0);
      return;
    }
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}

export function createInspection<TEventId extends EventId, TResourceId extends ResourceId>(
  context: InspectionContext<TEventId, TResourceId>,
): CalendarInspection<TEventId, TResourceId> & { readonly dispose: () => void } {
  const { container } = context;
  const spoken = recordAnnouncements(container);
  const timeZone = () => context.meta().environment.timeZone;
  const find = (query: EventQuery<TEventId>) =>
    findEvent(context.meta().eventSnapshot, query, timeZone());

  function getAllEvents(query: EventQuery<TEventId>) {
    const { id } = find(query);
    const elements = eventElements(container, id);
    if (elements.length === 0) {
      throw new CalendarQueryError(`The view doesn't show event ${JSON.stringify(id)}.`);
    }
    return elements;
  }

  function resourceId(query: ResourceQuery<TResourceId>): TResourceId | null {
    if (query === null || typeof query !== "object") return query;
    const match = context
      .meta()
      .resources.filter(
        (resource) => (resource as { readonly title?: unknown } | null)?.title === query.title,
      ) as readonly { readonly id: TResourceId }[];
    if (match.length !== 1) {
      throw new CalendarQueryError(
        `${match.length === 0 ? "No" : match.length} resources are titled ${JSON.stringify(query.title)}.`,
      );
    }
    return match[0]!.id;
  }

  const keyboard = createKeyboardDriver<TEventId, TResourceId>({
    container,
    direction: () => context.meta().environment.direction,
    event: find,
    focus: context.focus,
    setFocus: context.setFocus,
    timeZone,
    visibleRange: context.visibleRange,
  });
  const pointer = createPointerDriver<TEventId, TResourceId>({ container, event: find, timeZone });

  return Object.freeze({
    announcements: () => spoken.all(),
    dispose: () => spoken.stop(),
    getAllEvents,
    getDayCell(date: DateInput, options: { readonly resourceId?: TResourceId | null } = {}) {
      const cell = dayCell(container, date, options.resourceId);
      if (cell === null) {
        throw new CalendarQueryError(`The view shows no day cell for ${String(date)}.`);
      }
      return cell;
    },
    getEvent: (query: EventQuery<TEventId>) => getAllEvents(query)[0]!,
    getResource(query: ResourceQuery<TResourceId>) {
      const id = resourceId(query);
      const elements = resourceElements(container, id);
      const element =
        elements.find((candidate) => candidate.querySelector("[data-date]:not([data-all-day])")) ??
        elements[0];
      if (element === undefined) {
        throw new CalendarQueryError(`The view doesn't show resource ${JSON.stringify(id)}.`);
      }
      return element;
    },
    getTimeColumn(date: DateInput, options: { readonly resourceId?: TResourceId | null } = {}) {
      const column = timeColumn(container, date, options.resourceId);
      if (column === null) {
        throw new CalendarQueryError(`The view shows no time column for ${String(date)}.`);
      }
      return column;
    },
    keyboard,
    lastAnnouncement: () => spoken.current(),
    placementOf: (query: EventQuery<TEventId>) => summarizePlacement(find(query), timeZone()),
    pointer,
    queryEvent(query: EventQuery<TEventId>) {
      const found = findEvents(context.meta().eventSnapshot, query, timeZone());
      // Several matches is a mistake in the test, as it is for getEvent.
      const event = found.length > 1 ? find(query) : found[0];
      return event === undefined ? null : (eventElements(container, event.id)[0] ?? null);
    },
    async settled({ timeout = 5000 }: SettleOptions = {}) {
      context.ensureMounted();
      const started = realNow();
      for (;;) {
        await act(tick);
        if (context.pending().size === 0) break;
        if (realNow() - started > timeout) {
          const pending = [...context.pending().values()]
            .map(
              ({ change, phase }) =>
                `${change.cause} ${change.eventId === null ? "new" : JSON.stringify(change.eventId)} (${phase})`,
            )
            .join(", ");
          throw new Error(`Changes were still pending after ${timeout} ms: ${pending}.`);
        }
      }
      // One more turn, so results reported as a change settles have arrived.
      await act(tick);
    },
  });
}
