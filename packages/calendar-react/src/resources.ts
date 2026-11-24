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

/**
 * An expansion command. It reads a `CalendarResourceExpansionCause` from its argument and ignores
 * any other value, so it fits a callback that passes something else, as a switch's
 * `onCheckedChange` passes a boolean.
 */
export type CalendarResourceExpansionCommand = (cause?: unknown) => void;

export interface CalendarResourceExpansion {
  /** Whether the resource's children show. */
  readonly expanded: boolean;
  readonly collapse: CalendarResourceExpansionCommand;
  readonly expand: CalendarResourceExpansionCommand;
  readonly toggle: CalendarResourceExpansionCommand;
}

/** A command's options from what a toggle got: the click a person made, or a caller's options. */
function commandOf(cause: unknown): CalendarCommandOptions {
  if (typeof cause !== "object" || cause === null) return { reason: "resource-toggle" };
  if ("nativeEvent" in cause && cause.nativeEvent instanceof Event) {
    return { event: cause.nativeEvent, reason: "resource-toggle" };
  }
  const { event, reason, source } = cause as CalendarCommandOptions;
  return {
    reason: typeof reason === "string" ? reason : "resource-toggle",
    ...(event instanceof Event ? { event } : {}),
    ...(typeof source === "string" ? { source } : {}),
  };
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
    const set = (next: boolean, cause: unknown) => {
      const current = read().expandedResourceIds;
      if (current.includes(resourceId) === next) return;
      actions.setExpandedResourceIds(
        next ? [...current, resourceId] : current.filter((id) => id !== resourceId),
        commandOf(cause),
      );
    };
    return Object.freeze({
      collapse: (cause?: unknown) => set(false, cause),
      expand: (cause?: unknown) => set(true, cause),
      expanded,
      toggle: (cause?: unknown) => set(!read().expandedResourceIds.includes(resourceId), cause),
    });
  }, [actions, expanded, read, resourceId]);
}
