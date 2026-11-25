import {
  visibleResources,
  type ResourceId,
  type ResourceTree,
  type ResourceVisibilityOptions,
  type VisibleResource,
} from "@moltenship/calendar-core";
import { createResourceExpansionCommands } from "@moltenship/calendar-primitives";
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

/** What a toggle got, with a React event in place of the DOM event it wraps. */
function causeOf(cause: unknown): unknown {
  return typeof cause === "object" &&
    cause !== null &&
    "nativeEvent" in cause &&
    cause.nativeEvent instanceof Event
    ? cause.nativeEvent
    : cause;
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
  const commands = useMemo(
    () => createResourceExpansionCommands({ actions, read }, resourceId),
    [actions, read, resourceId],
  );
  return useMemo(
    () =>
      Object.freeze({
        collapse: (cause?: unknown) => commands.collapse(causeOf(cause)),
        expand: (cause?: unknown) => commands.expand(causeOf(cause)),
        expanded,
        toggle: (cause?: unknown) => commands.toggle(causeOf(cause)),
      }),
    [commands, expanded],
  );
}
