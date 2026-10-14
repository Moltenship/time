import type {
  CalendarFocus,
  CalendarMeta,
  CalendarPendingChanges,
  EventId,
  ResourceId,
} from "@moltenship/calendar";
import { act } from "react";

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

/** A resource: its ID, or `{ title }`. */
export type ResourceQuery<TResourceId extends ResourceId = ResourceId> =
  | TResourceId
  | { readonly title: string };

export interface SettleOptions {
  /** How long to wait, in milliseconds. 5000 by default. */
  readonly timeout?: number;
}

/** Finds what a calendar shows, drives it, and reads what it said. */
export interface CalendarInspection<
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
> {
  /**
   * The element showing an event, found by its ID, title or start through the calendar's own
   * events, so it holds in any language. With `date`, the part on that day. Throws when the query
   * names no event, several, or one the view doesn't show.
   */
  getEvent(event: EventQuery, options?: { readonly date?: DateInput }): HTMLElement;
  /** Every element showing an event: one per day it spans and per resource it's in. */
  getAllEvents(event: EventQuery): HTMLElement[];
  /**
   * The element showing an event, or `null` when the view doesn't show it or there's no such
   * event. Throws when the query names several events.
   */
  queryEvent(event: EventQuery): HTMLElement | null;
  /** A time grid's all-day cell for a date, or a month's day, in a resource. */
  getDayCell(date: DateInput, options?: { readonly resourceId?: TResourceId | null }): HTMLElement;
  /** The column of a date's hours in a time grid, or its strip along a timeline row. */
  getTimeColumn(
    date: DateInput,
    options?: { readonly resourceId?: TResourceId | null },
  ): HTMLElement;
  /** The element a resource's column or row carries `resourceIdAttributes` on. */
  getResource(resource: ResourceQuery<TResourceId>): HTMLElement;
  /** Where an event shows now, pending changes included, as comparable text. */
  placementOf(event: EventQuery): EventPlacementSummary<TEventId, TResourceId>;
  /** Waits until no change is pending: every proposal validated, saved and in the events. */
  settled(options?: SettleOptions): Promise<void>;
  /** Every message the `Announcer` spoke, oldest first. */
  announcements(): readonly string[];
  /** What the `Announcer` says now; `undefined` when it's silent or there's none. */
  lastAnnouncement(): string | undefined;
  readonly keyboard: KeyboardDriver<TResourceId>;
  readonly pointer: PointerDriver<TResourceId>;
}

export interface InspectionContext<TEventId extends EventId, TResourceId extends ResourceId> {
  readonly container: HTMLElement;
  readonly ensureMounted: () => void;
  readonly focus: () => CalendarFocus | null;
  readonly meta: () => CalendarMeta<unknown, unknown, never, TEventId, TResourceId>;
  readonly pending: () => CalendarPendingChanges<unknown, TEventId, TResourceId>;
  readonly setFocus: (focus: CalendarFocus) => void;
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
  const find = (query: EventQuery) => findEvent(context.meta().eventSnapshot, query, timeZone());

  function getAllEvents(query: EventQuery) {
    const { id } = find(query);
    const elements = eventElements(container, id);
    if (elements.length === 0) {
      throw new CalendarQueryError(`The view doesn't show event ${String(id)}.`);
    }
    return elements;
  }

  function resourceId(query: ResourceQuery<TResourceId>): TResourceId {
    if (typeof query !== "object") return query;
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

  const keyboard = createKeyboardDriver<TResourceId>({
    container,
    direction: () => context.meta().environment.direction,
    eventId: (query) => find(query).id,
    focus: context.focus,
    setFocus: context.setFocus,
  });
  const pointer = createPointerDriver<TResourceId>({
    container,
    event: find,
    timeZone,
  });

  return Object.freeze({
    announcements: () => spoken.all(),
    dispose: () => spoken.stop(),
    getAllEvents,
    getDayCell(date: DateInput, options: { readonly resourceId?: TResourceId | null } = {}) {
      const cell = dayCell(container, date, options.resourceId);
      if (cell === null)
        throw new CalendarQueryError(`The view shows no day cell for ${String(date)}.`);
      return cell;
    },
    getEvent(query: EventQuery, options: { readonly date?: DateInput } = {}) {
      const elements = getAllEvents(query);
      if (options.date === undefined) return elements[0]!;
      const date = String(options.date);
      const element = elements.find(
        (candidate) => candidate.closest("[data-date]")?.getAttribute("data-date") === date,
      );
      if (element === undefined) {
        throw new CalendarQueryError(
          `The view doesn't show event ${String(find(query).id)} on ${date}.`,
        );
      }
      return element;
    },
    getResource(query: ResourceQuery<TResourceId>) {
      const id = resourceId(query);
      const elements = resourceElements(container, id);
      const element =
        elements.find((candidate) => candidate.querySelector("[data-date]:not([data-all-day])")) ??
        elements[0];
      if (element === undefined)
        throw new CalendarQueryError(`The view doesn't show resource ${String(id)}.`);
      return element;
    },
    getTimeColumn(date: DateInput, options: { readonly resourceId?: TResourceId | null } = {}) {
      const column = timeColumn(container, date, options.resourceId);
      if (column === null)
        throw new CalendarQueryError(`The view shows no time column for ${String(date)}.`);
      return column;
    },
    keyboard,
    lastAnnouncement: () => spoken.current(),
    placementOf: (query: EventQuery) => summarizePlacement(find(query), timeZone()),
    pointer,
    queryEvent(query: EventQuery) {
      const found = findEvents(context.meta().eventSnapshot, query, timeZone());
      // Several matches is a mistake in the test, as it is for getEvent.
      const event = found.length > 1 ? find(query) : found[0];
      return event === undefined ? null : (eventElements(container, event.id)[0] ?? null);
    },
    async settled({ timeout = 5000 }: SettleOptions = {}) {
      context.ensureMounted();
      const started = performance.now();
      for (;;) {
        await act(tick);
        if (context.pending().size === 0) break;
        if (performance.now() - started > timeout) {
          const pending = [...context.pending().values()]
            .map(
              ({ change, phase }) =>
                `${change.cause} ${String(change.eventId ?? "new")} (${phase})`,
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
