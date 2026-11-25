import type { ResourceId } from "@moltenship/calendar-core";

import type { CalendarInteractionRuntime } from "./interaction";
import type { CalendarCommandOptions } from "./types";

/**
 * One resource's expansion commands. Each reads what caused it from its argument: a DOM event,
 * which `onExpandedResourceIdsChange` hears with the reason `"resource-toggle"`, or a command's
 * options, `"resource-toggle"` unless they give another reason. Any other value is ignored, so a
 * command fits a callback that passes something else, as a switch's change handler passes a
 * boolean.
 */
export interface CalendarResourceExpansionCommands {
  readonly collapse: (cause?: unknown) => void;
  readonly expand: (cause?: unknown) => void;
  readonly toggle: (cause?: unknown) => void;
}

/** A command's options from what a toggle got: the event a person caused, or a caller's options. */
function commandOf(cause: unknown): CalendarCommandOptions {
  if (typeof cause !== "object" || cause === null) return { reason: "resource-toggle" };
  if (cause instanceof Event) return { event: cause, reason: "resource-toggle" };
  const { event, reason, source } = cause as CalendarCommandOptions;
  return {
    reason: typeof reason === "string" ? reason : "resource-toggle",
    ...(event instanceof Event ? { event } : {}),
    ...(typeof source === "string" ? { source } : {}),
  };
}

/**
 * Expands and collapses `resourceId` through the root's `expandedResourceIds`. Each command reads
 * the latest requested state, so consecutive commands in one handler compose, and one that would
 * change nothing asks nothing.
 */
export function createResourceExpansionCommands(
  { actions, read }: Pick<CalendarInteractionRuntime, "actions" | "read">,
  resourceId: ResourceId,
): CalendarResourceExpansionCommands {
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
    toggle: (cause?: unknown) => set(!read().expandedResourceIds.includes(resourceId), cause),
  });
}
