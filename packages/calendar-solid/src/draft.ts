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
import { createMemo, type Accessor } from "solid-js";

import { access, useInteractionNow, useShared, type MaybeAccessor } from "./shared";
import { createStateSelector } from "./state-selector";

export type { CalendarBusyResources, CalendarDraftBusy };

type AnyDraft = CalendarDraft<EventId, ResourceId>;

const same = <T>(value: T) => value;

export interface CalendarBusyResourcesOptions {
  /** An event to leave out, such as the one being moved. */
  readonly exclude?: EventId | null;
  /** Only these resources; every resource by default. */
  readonly resourceIds?: readonly ResourceId[];
}

/**
 * The resources busy during `range`, such as a meeting being placed, with their events, as an
 * accessor; free ones are absent. It queries the root's events, pending changes included, once
 * per change of events, range or options. `null` asks nothing.
 */
export function useBusyResources(
  range: MaybeAccessor<InstantInterval | CalendarEventInterval | null>,
  options: MaybeAccessor<CalendarBusyResourcesOptions> = {},
): Accessor<CalendarBusyResources> {
  const { availability, events } = useShared();
  const query = createBusyResourcesQuery();
  return createMemo(() => {
    const { exclude, resourceIds } = access(options);
    return query(events(), access(range), {
      exclude,
      resourceIds,
      timeZone: availability().timeZone,
    });
  });
}

/** Reports the pointer's draft to the root, for `onPreview` of `useCalendarPointer`. */
export function useCalendarDraftReporter(): (draft: AnyDraft | null) => void {
  return useInteractionNow().pointerDraft.set;
}

/**
 * The change being drafted, by pointer or keyboard, as an accessor: the event it changes (`null`
 * when creating) and where it would land; `null` without one, and on the server and while
 * hydrating. It changes once a slot step, so pass its `proposed` to `useBusyResources` for any
 * "who's busy" UI of your own.
 */
export function useCalendarDraft(): Accessor<AnyDraft | null> {
  return createStateSelector(useInteractionNow().draft, same);
}

/**
 * A resource during the draft's time while one is being made, by pointer or keyboard: the busy
 * events that overlap it (the draft's own event aside; see `isBusy` on the event adapter), and
 * whether the time falls outside its hours. `null` without a draft, or for a `null` resource.
 * Whatever reads it updates only when its own resource's answer changes.
 */
export function useDraftBusy(
  resourceId: MaybeAccessor<ResourceId | null>,
): Accessor<CalendarDraftBusy | null> {
  const { availability, events } = useShared();
  const query = createDraftBusyQuery();
  return createStateSelector(useInteractionNow().draft, (draft) =>
    query(draft, events(), availability(), access(resourceId)),
  );
}
