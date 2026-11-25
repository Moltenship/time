import type {
  CalendarDraft,
  CalendarEventInterval,
  EventId,
  ResourceId,
} from "@moltenship/calendar-core";
import {
  createBusyResourcesQuery,
  createDraftBusyQuery,
  type CalendarBusyResources,
  type CalendarDraftBusy,
} from "@moltenship/calendar-primitives";
import type { InstantInterval } from "@moltenship/calendar-temporal";
import { useState, useSyncExternalStore } from "react";

import { useCalendarAvailability } from "./availability";
import { useInteractionRuntime } from "./interaction";
import { useCalendarEvents } from "./status";

export type { CalendarBusyResources, CalendarDraftBusy };

type AnyDraft = CalendarDraft<EventId, ResourceId>;

const serverDraft = () => null;

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
  const events = useCalendarEvents();
  const { timeZone } = useCalendarAvailability();
  const [query] = useState(createBusyResourcesQuery);
  return query(events, range, { exclude, resourceIds, timeZone });
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
  const { draft } = useInteractionRuntime();
  return useSyncExternalStore(draft.subscribe, draft.getSnapshot, serverDraft);
}

/**
 * A resource during the draft's time while one is being made, by pointer or keyboard: the busy
 * events that overlap it (the draft's own event aside; see `isBusy` on the event adapter), and
 * whether the time falls outside its hours. `null` without a draft, or for a `null` resource.
 * The draft's busy resources are worked out once a step for every component that asks, and a
 * component re-renders only when its own resource's answer changes.
 */
export function useDraftBusy(resourceId: ResourceId | null): CalendarDraftBusy | null {
  const { draft } = useInteractionRuntime();
  const events = useCalendarEvents();
  const availability = useCalendarAvailability();
  const [query] = useState(createDraftBusyQuery);
  const read = () => query(draft.getSnapshot(), events, availability, resourceId);
  return useSyncExternalStore(draft.subscribe, read, serverDraft);
}
