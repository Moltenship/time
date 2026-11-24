import {
  visibleResources,
  type ResourceId,
  type ResourceTree,
  type ResourceVisibilityOptions,
  type VisibleResource,
} from "@moltenship/calendar-core";
import { createContext, useContext, useMemo, type Context, type SyntheticEvent } from "react";

import type { AnyCalendarState } from "./context";
import { sameElements } from "./equality";
import { useInteractionRuntime } from "./interaction";
import { useStateSelector } from "./state-binding";
import type { CalendarCommandOptions } from "./types";

/** The nearest root's resource tree, shared by every factory so resource hooks work in any view. */
export const CalendarResourcesContext: Context<ResourceTree | null> =
  createContext<ResourceTree | null>(null);

/**
 * What an expansion command passes on to `onExpandedResourceIdsChange`: the event behind it, as
 * a React event (so `onClick={toggle}` works) or a command's options. Its reason is
 * `"resource-toggle"` unless the options give another.
 */
export type CalendarResourceExpansionCause = CalendarCommandOptions | SyntheticEvent;

export interface CalendarResourceExpansion {
  /** Whether the resource's children show. */
  readonly expanded: boolean;
  readonly collapse: (cause?: CalendarResourceExpansionCause) => void;
  readonly expand: (cause?: CalendarResourceExpansionCause) => void;
  readonly toggle: (cause?: CalendarResourceExpansionCause) => void;
}

/** A command's options from what a toggle got: the click a person made, or a caller's options. */
function commandOf(cause: CalendarResourceExpansionCause | undefined): CalendarCommandOptions {
  if (cause !== undefined && "nativeEvent" in cause) {
    return { event: cause.nativeEvent, reason: "resource-toggle" };
  }
  return { reason: "resource-toggle", ...cause };
}

const selectExpanded = (state: AnyCalendarState) => state.expandedResourceIds;

/**
 * The root's resources as a view shows them: depth first, with collapsed resources' descendants
 * left out (see `visibleResources`). Re-renders when the resources or their expansion change.
 */
export function useVisibleResources(
  options: ResourceVisibilityOptions = {},
): readonly VisibleResource[] {
  const tree = useContext(CalendarResourcesContext);
  if (tree === null) throw new Error("calendar-hook-outside-root");
  const expanded = useStateSelector(useInteractionRuntime().source, selectExpanded, {
    isEqual: sameElements,
  });
  const { unassigned } = options;
  return useMemo(
    () => visibleResources(tree, expanded, { unassigned }),
    [expanded, tree, unassigned],
  );
}

/**
 * One resource's expansion and the commands that change it, through `expandedResourceIds`. A
 * component re-renders only when this resource expands or collapses, so a resource header can
 * own its toggle.
 */
export function useResourceExpansion(resourceId: ResourceId): CalendarResourceExpansion {
  const { actions, read, source } = useInteractionRuntime();
  const expanded = useStateSelector(source, (state) =>
    state.expandedResourceIds.includes(resourceId),
  );
  return useMemo(() => {
    // Reads the latest requested state, so consecutive commands in one handler compose.
    const set = (next: boolean, cause: CalendarResourceExpansionCause | undefined) => {
      const current = read().expandedResourceIds;
      if (current.includes(resourceId) === next) return;
      actions.setExpandedResourceIds(
        next ? [...current, resourceId] : current.filter((id) => id !== resourceId),
        commandOf(cause),
      );
    };
    return Object.freeze({
      collapse: (cause?: CalendarResourceExpansionCause) => set(false, cause),
      expand: (cause?: CalendarResourceExpansionCause) => set(true, cause),
      expanded,
      toggle: (cause?: CalendarResourceExpansionCause) =>
        set(!read().expandedResourceIds.includes(resourceId), cause),
    });
  }, [actions, expanded, read, resourceId]);
}
