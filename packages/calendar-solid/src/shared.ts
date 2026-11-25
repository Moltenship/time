import type {
  AvailabilitySnapshot,
  CalendarEnvironment,
  EventId,
  EventSnapshot,
  ResourceId,
  ResourceTree,
} from "@moltenship/calendar-core";
import type {
  CalendarAnnotations,
  CalendarInteractionRuntime,
  CalendarViewRuntime,
} from "@moltenship/calendar-primitives";
import { untrack, type Accessor } from "solid-js";

import { createRootContext, type RootContext } from "./root-context";

/**
 * What the nearest root shares with the hooks that work inside any calendar, whatever factory made
 * it, as React's shared contexts do: views and their gestures read the root they render in.
 */
export interface CalendarSharedValue {
  readonly annotations: Accessor<CalendarAnnotations>;
  readonly availability: Accessor<AvailabilitySnapshot>;
  /** The root's environment, whose `now` and `clock` `useNow` reads. */
  readonly environment: Accessor<CalendarEnvironment>;
  /** The events views show, pending changes included. */
  readonly events: Accessor<EventSnapshot<unknown, EventId, ResourceId>>;
  /** Its identity changes with the controlled slices and `onEventChange`; its stores don't. */
  readonly interaction: Accessor<CalendarInteractionRuntime>;
  readonly resources: Accessor<ResourceTree>;
}

export const sharedContext: RootContext<CalendarSharedValue> =
  createRootContext<CalendarSharedValue>("calendar-shared");

/** The active view's focus plumbing, which `ActiveView` provides to the view it renders. */
export const viewRuntimeContext: RootContext<CalendarViewRuntime> =
  createRootContext<CalendarViewRuntime>(
    "calendar-view-runtime",
    "calendar-view-hook-outside-active-view",
  );

export function useShared(): CalendarSharedValue {
  return sharedContext.use();
}

/**
 * The root's interaction runtime as it is now. Its stores (`keyboard`, `draft`, `pointerDraft`,
 * `announcements`, `changes`) live as long as the root, so a hook may keep them.
 */
export function useInteractionNow(): CalendarInteractionRuntime {
  return untrack(sharedContext.use().interaction);
}

/** A value, or an accessor of one: what the hooks take wherever an argument may change. */
export type MaybeAccessor<T> = T | Accessor<T>;

/** Reads a `MaybeAccessor`. Only for values that are never functions themselves. */
export function access<T>(value: MaybeAccessor<T>): T {
  return typeof value === "function" ? (value as Accessor<T>)() : value;
}
