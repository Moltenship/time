import {
  busyResources,
  fitsAvailability,
  type CalendarDraft,
  type CalendarEventInterval,
  type EventId,
  type EventSnapshot,
  type NormalizedCalendarEvent,
  type ResourceId,
} from "@moltenship/calendar-core";
import type { InstantInterval } from "@moltenship/calendar-temporal";
import { useContext, useMemo, useRef, useSyncExternalStore } from "react";

import { useCalendarAvailability } from "./availability";
import type { CalendarStateSource } from "./context";
import { useInteractionRuntime } from "./interaction";
import { useStableValue } from "./use-stable-value";
import { CalendarEventsContext } from "./status";

type AnyDraft = CalendarDraft<EventId, ResourceId>;
type AnyEvents = EventSnapshot<unknown, EventId, ResourceId>;

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

/** The pointer's draft, which the pointer layer reports through `useCalendarDraftReporter`. */
export interface DraftStore extends CalendarStateSource<AnyDraft | null> {
  readonly set: (draft: AnyDraft | null) => void;
}

export function createDraftStore(): DraftStore {
  let draft: AnyDraft | null = null;
  const listeners = new Set<() => void>();
  return Object.freeze({
    getSnapshot: () => draft,
    set(next: AnyDraft | null) {
      if (next === draft) return;
      draft = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
}

function useEvents(): AnyEvents {
  const events = useContext(CalendarEventsContext);
  if (events === null) throw new Error("calendar-hook-outside-root");
  return events;
}

function sameIds(
  left: readonly ResourceId[] | undefined,
  right: readonly ResourceId[] | undefined,
) {
  return (
    left === right ||
    (left !== undefined &&
      right !== undefined &&
      left.length === right.length &&
      left.every((id, index) => id === right[index]))
  );
}

function sameRange(
  left: InstantInterval | CalendarEventInterval | null,
  right: InstantInterval | CalendarEventInterval | null,
) {
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
 * The resources busy during `range`, such as a meeting being placed, with their events; free
 * ones are absent. It queries the root's events, pending changes included, once per change of
 * events or range, however many components ask. `exclude` leaves out an event, such as the one
 * being moved; `null` asks nothing.
 */
export function useBusyResources(
  range: InstantInterval | CalendarEventInterval | null,
  {
    exclude,
    resourceIds,
  }: { readonly exclude?: EventId | null; readonly resourceIds?: readonly ResourceId[] } = {},
): CalendarBusyResources {
  const events = useEvents();
  const { timeZone } = useCalendarAvailability();
  const stableRange = useStableValue(range, sameRange);
  const ids = useStableValue(resourceIds, sameIds);
  return useMemo(
    () =>
      stableRange === null
        ? nothingBusy
        : busyResources(events, stableRange, {
            ...(exclude == null ? {} : { exclude }),
            ...(ids === undefined ? {} : { resourceIds: ids }),
            timeZone,
          }),
    [events, exclude, ids, stableRange, timeZone],
  );
}

/** Each draft's busy resources, worked out once for every header that asks. */
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

/** Subscribes to the keyboard's and the pointer's drafts. */
function useDraftSource(): CalendarStateSource<AnyDraft | null> {
  const { keyboard, pointerDraft } = useInteractionRuntime();
  return useMemo(
    () => ({
      getSnapshot: () => keyboard.grabs.getSnapshot()?.session ?? pointerDraft.getSnapshot(),
      subscribe: (listener: () => void) => {
        const stops = [keyboard.grabs.subscribe(listener), pointerDraft.subscribe(listener)];
        return () => {
          for (const stop of stops) stop();
        };
      },
    }),
    [keyboard, pointerDraft],
  );
}

/** Reports the pointer's draft to the root, for `onPreview` of `useCalendarPointer`. */
export function useCalendarDraftReporter(): (draft: AnyDraft | null) => void {
  return useInteractionRuntime().pointerDraft.set;
}

/**
 * The change being drafted, by pointer or keyboard: the event it changes (`null` when creating)
 * and where it would land; `null` without one. It changes once a slot step, so pass its
 * `proposed` to `useBusyResources` for any "who's busy" UI of your own.
 */
export function useCalendarDraft(): AnyDraft | null {
  const source = useDraftSource();
  return useSyncExternalStore(source.subscribe, source.getSnapshot, () => null);
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
 * A resource during the draft's time while one is being made, by pointer or keyboard: the busy
 * events that overlap it (the draft's own event aside; see `isBusy` on the event adapter), and
 * whether the time falls outside its hours. `null` without a draft, or for a `null` resource.
 * The draft's busy resources are worked out once a step for every component that asks, and a
 * component re-renders only when its own resource's answer changes.
 */
export function useDraftBusy(resourceId: ResourceId | null): CalendarDraftBusy | null {
  const source = useDraftSource();
  const events = useEvents();
  const availability = useCalendarAvailability();
  const last = useRef<CalendarDraftBusy | null>(null);
  const read = () => {
    const draft = source.getSnapshot();
    if (draft === null || resourceId === null) return (last.current = null);
    const { timeZone } = availability;
    const next: CalendarDraftBusy = {
      events: busyFor(draft, events, timeZone).get(resourceId) ?? noEvents,
      outsideHours: !fitsAvailability(
        draft.proposed,
        availability.forResource(resourceId),
        timeZone,
      ),
    };
    if (!sameBusy(last.current, next)) last.current = next;
    return last.current;
  };
  return useSyncExternalStore(source.subscribe, read, () => null);
}
