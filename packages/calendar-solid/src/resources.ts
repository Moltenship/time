import {
  visibleResources,
  type ResourceId,
  type ResourceVisibilityOptions,
  type VisibleResource,
} from "@moltenship/calendar-core";
import {
  createResourceExpansionCommands,
  sameElements,
  type AnyCalendarState,
  type CalendarCommandOptions,
} from "@moltenship/calendar-primitives";
import { createMemo, untrack, type Accessor } from "solid-js";

import { access, useShared, type MaybeAccessor } from "./shared";
import { createStateSelector } from "./state-selector";

/**
 * What an expansion command passes on to `onExpandedResourceIdsChange`: the DOM event behind it
 * (so `onClick={toggle}` works) or a command's options. Its reason is `"resource-toggle"` unless
 * the options give another.
 */
export type CalendarResourceExpansionCause = CalendarCommandOptions | Event;

/**
 * An expansion command. It reads a `CalendarResourceExpansionCause` from its argument and ignores
 * any other value, so it fits a callback that passes something else, as a switch's change
 * handler passes a boolean.
 */
export type CalendarResourceExpansionCommand = (cause?: unknown) => void;

export interface CalendarResourceExpansion {
  /** Whether the resource's children show; whatever reads it updates when that changes. */
  readonly expanded: Accessor<boolean>;
  readonly collapse: CalendarResourceExpansionCommand;
  readonly expand: CalendarResourceExpansionCommand;
  readonly toggle: CalendarResourceExpansionCommand;
}

const selectExpanded = (state: AnyCalendarState) => state.expandedResourceIds;

/**
 * The root's resources as a view shows them, as an accessor: depth first, with collapsed
 * resources' descendants left out (see `visibleResources`). It changes when the resources or
 * their expansion do.
 */
export function useVisibleResources(
  options: MaybeAccessor<ResourceVisibilityOptions> = {},
): Accessor<readonly VisibleResource[]> {
  const { interaction, resources } = useShared();
  const expanded = createStateSelector(() => interaction().source, selectExpanded, {
    isEqual: sameElements,
  });
  return createMemo(() =>
    visibleResources(resources(), expanded(), { unassigned: access(options).unassigned }),
  );
}

/**
 * One resource's expansion and the commands that change it, through `expandedResourceIds`.
 * `expanded` updates only when this resource expands or collapses, so a resource header can own
 * its toggle. `resourceId` may be an accessor; each command acts on the resource it names then.
 */
export function useResourceExpansion(
  resourceId: MaybeAccessor<ResourceId>,
): CalendarResourceExpansion {
  const { interaction } = useShared();
  const expanded = createStateSelector(
    () => interaction().source,
    (state: AnyCalendarState) => state.expandedResourceIds.includes(access(resourceId)),
  );
  // The latest runtime and resource, whenever a command runs.
  const commands = () =>
    untrack(() => createResourceExpansionCommands(interaction(), access(resourceId)));
  return Object.freeze({
    collapse: (cause?: unknown) => commands().collapse(cause),
    expand: (cause?: unknown) => commands().expand(cause),
    expanded,
    toggle: (cause?: unknown) => commands().toggle(cause),
  });
}
