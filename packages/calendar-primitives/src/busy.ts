import {
  busyResources,
  fitsAvailability,
  type AvailabilitySnapshot,
  type CalendarEventInterval,
  type EventId,
  type NormalizedCalendarEvent,
  type ResourceId,
} from "@moltenship/calendar-core";
import type { InstantInterval } from "@moltenship/calendar-temporal";

import type { AnyEvents } from "./agent";
import type { AnyDraft } from "./draft-store";
import { sameElements } from "./equality";

/** The busy resources of a range, with the events that make them busy; see `busyResources`. */
export type CalendarBusyResources = ReadonlyMap<
  ResourceId,
  readonly NormalizedCalendarEvent<unknown, EventId, ResourceId>[]
>;

/** A resource during the draft's time; see `useDraftBusy`. */
export interface CalendarDraftBusy {
  /** The busy events that overlap the draft, by start; empty when the resource is free. */
  readonly events: readonly NormalizedCalendarEvent<unknown, EventId, ResourceId>[];
  /** Whether the draft falls outside the resource's hours. */
  readonly outsideHours: boolean;
}

/** What a busy-resources query asks about a range, besides the range. */
export interface CalendarBusyResourcesQuery {
  /** An event left out, such as the one being moved; `null` and `undefined` leave none out. */
  readonly exclude?: EventId | null;
  /** The resources asked about; every resource by default. */
  readonly resourceIds?: readonly ResourceId[];
  /** The display time zone, which all-day and floating events count on. */
  readonly timeZone: string;
}

function sameIds(
  left: readonly ResourceId[] | undefined,
  right: readonly ResourceId[] | undefined,
) {
  return left === right || (left !== undefined && right !== undefined && sameElements(left, right));
}

type BusyRange = InstantInterval | CalendarEventInterval;

function sameInterval(left: BusyRange | null, right: BusyRange | null) {
  return (
    left === right ||
    (left !== null &&
      right !== null &&
      ("kind" in left ? left.kind : "timed") === ("kind" in right ? right.kind : "timed") &&
      left.start.toString() === right.start.toString() &&
      left.end.toString() === right.end.toString())
  );
}

const nothingBusy: CalendarBusyResources = new Map();

/**
 * A memoized query for the resources busy during a range, with their events; free ones are
 * absent. Call it with the root's events, pending changes included, as often as a framework
 * renders: it queries again only when the events, the range or the query change, the range and
 * the resource IDs by value, so ones made inline cost nothing. A `null` range asks nothing.
 */
export function createBusyResourcesQuery(): (
  events: AnyEvents,
  range: BusyRange | null,
  query: CalendarBusyResourcesQuery,
) => CalendarBusyResources {
  let held:
    | {
        readonly busy: CalendarBusyResources;
        readonly events: AnyEvents;
        readonly exclude: EventId | null | undefined;
        readonly range: BusyRange | null;
        readonly resourceIds: readonly ResourceId[] | undefined;
        readonly timeZone: string;
      }
    | undefined;
  return (events, range, { exclude, resourceIds, timeZone }) => {
    if (
      held !== undefined &&
      held.events === events &&
      held.exclude === exclude &&
      held.timeZone === timeZone &&
      sameInterval(held.range, range) &&
      sameIds(held.resourceIds, resourceIds)
    ) {
      return held.busy;
    }
    const busy =
      range === null
        ? nothingBusy
        : busyResources(events, range, {
            ...(exclude == null ? {} : { exclude }),
            ...(resourceIds === undefined ? {} : { resourceIds }),
            timeZone,
          });
    held = { busy, events, exclude, range, resourceIds, timeZone };
    return busy;
  };
}

/** Each draft's busy resources, worked out once for every resource that asks. */
const draftBusy = new WeakMap<AnyDraft, { events: AnyEvents; busy: CalendarBusyResources }>();

function busyFor(draft: AnyDraft, events: AnyEvents, timeZone: string): CalendarBusyResources {
  const cached = draftBusy.get(draft);
  if (cached?.events === events) return cached.busy;
  const busy = busyResources(events, draft.proposed, {
    ...(draft.eventId === null ? {} : { exclude: draft.eventId }),
    timeZone,
  });
  draftBusy.set(draft, { busy, events });
  return busy;
}

const noEvents: readonly NormalizedCalendarEvent<unknown, EventId, ResourceId>[] = Object.freeze(
  [],
);

function sameBusy(left: CalendarDraftBusy | null, right: CalendarDraftBusy | null): boolean {
  return (
    left === right ||
    (left !== null &&
      right !== null &&
      left.outsideHours === right.outsideHours &&
      left.events.length === right.events.length &&
      left.events.every((event, index) => event === right.events[index]))
  );
}

/**
 * One resource's query of the draft (`CalendarInteractionRuntime.draft`): the busy events that
 * overlap the draft's time, the draft's own event aside, and whether the time falls outside the
 * resource's hours; `null` without a draft, or for a `null` resource. The draft's busy resources
 * are worked out once per draft and events for every resource that asks, and the result keeps its
 * identity while the answer is the same, so a framework re-renders only when it changes.
 */
export function createDraftBusyQuery(): (
  draft: AnyDraft | null,
  events: AnyEvents,
  availability: AvailabilitySnapshot,
  resourceId: ResourceId | null,
) => CalendarDraftBusy | null {
  let last: CalendarDraftBusy | null = null;
  return (draft, events, availability, resourceId) => {
    if (draft === null || resourceId === null) return (last = null);
    const { timeZone } = availability;
    const next: CalendarDraftBusy = {
      events: busyFor(draft, events, timeZone).get(resourceId) ?? noEvents,
      outsideHours: !fitsAvailability(
        draft.proposed,
        availability.forResource(resourceId),
        timeZone,
      ),
    };
    if (!sameBusy(last, next)) last = next;
    return last;
  };
}
