"use client";

import {
  useDraftBusy,
  useNow,
  useResourceStatus,
  type CalendarDraftBusy,
  type CalendarEnvironmentBase,
  type CalendarResource,
  type ResourceId,
} from "@moltenship/calendar";
import { useMemo, type ComponentProps, type ComponentType } from "react";

import { Badge } from "@registry/calendar-ui/badge";
import {
  resourceStatusFormats,
  resourceStatusLabels,
  resourceStatusUntil,
  summarizeDraft,
  summarizeResourceStatus,
  type ResourceStatusLabels,
  type ResourceStatusSummary,
} from "@registry/shared/calendar/resource-status-summary";
import {
  resourceStatusBadgeClass,
  resourceStatusDotClass,
  resourceStatusSpokenClass,
  resourceStatusTextClass,
} from "@registry/shared/calendar/resource-status.styles";
import { cn } from "cn";

export {
  draftStatusAttributes,
  resourceStatusLabels,
  resourceStatusOptions,
} from "@registry/shared/calendar/resource-status-summary";
export type {
  ResourceStatusLabels,
  ResourceStatusState,
  ResourceStatusSummary,
} from "@registry/shared/calendar/resource-status-summary";

/** What a resource header's status gets during a draft; see `ResourceStatusOptions`. */
export interface ResourceDraftStatusProps extends CalendarDraftBusy {
  /** The classes the badge would get in its place, such as how it sits in its row. */
  readonly className?: string;
  /** The resource, or `null` for the Unassigned column. */
  readonly resource: CalendarResource<unknown, ResourceId> | null;
}

/** How the resource views show each resource's status; `resourceStatus: true` takes defaults. */
export interface ResourceStatusOptions {
  /** Words in place of the English ones, for the badge and screen readers. */
  readonly labels?: Partial<ResourceStatusLabels>;
  /**
   * Draws the status while a draft is being made, in place of the badge, as `ResourceHeader`
   * replaces a header: the resource's busy events during the draft and whether it falls outside
   * its hours. For the draft's range, call `useCalendarDraft`, so only components that need it
   * re-render on every step.
   */
  readonly DraftStatus?: ComponentType<ResourceDraftStatusProps>;
}

type Environment = Pick<CalendarEnvironmentBase, "locale" | "timeZone">;

/**
 * A resource's status now on the calendar's clock, in words: "until 3:00 PM" on the display
 * clock, with the weekday within the next six days, and the date further out. `null` while
 * server rendering, and for a `null` resource.
 */
export function useResourceStatusSummary(
  { locale, timeZone }: Environment,
  resourceId: ResourceId | null,
  labels: ResourceStatusLabels = resourceStatusLabels,
): ResourceStatusSummary | null {
  const status = useResourceStatus(resourceId);
  // The status changes only at its own instants; the clock tells "3:00 PM" from "Mon 3:00 PM".
  const now = useNow();
  const formats = useMemo(() => resourceStatusFormats({ locale, timeZone }), [locale, timeZone]);
  if (status === null || now === null) return null;
  return summarizeResourceStatus(status, resourceStatusUntil(formats, now, timeZone), labels);
}

/** What a resource header shows: the draft's status while one is made, the status now otherwise. */
export interface ResourceHeaderStatusValue {
  /** The resource during the draft, or `null` without one. */
  readonly draft: CalendarDraftBusy | null;
  readonly options: ResourceStatusOptions;
  readonly resource: CalendarResource<unknown, ResourceId> | null;
  readonly summary: ResourceStatusSummary | null;
}

/**
 * A resource header's status, now and during a draft, with `options`; `null` without options,
 * for a group, whose own bookings aren't its members', or for the Unassigned column.
 */
export function useResourceHeaderStatus(
  environment: Environment,
  resource: {
    readonly hasChildren: boolean;
    readonly id: ResourceId | null;
    readonly resource: CalendarResource<unknown, ResourceId> | null;
  },
  options: ResourceStatusOptions | null,
): ResourceHeaderStatusValue | null {
  const shown = options !== null && !resource.hasChildren ? resource.id : null;
  const custom = options?.labels;
  const labels = useMemo(() => ({ ...resourceStatusLabels, ...custom }), [custom]);
  const draft = useDraftBusy(shown);
  const now = useResourceStatusSummary(environment, shown, labels);
  if (options === null || shown === null) return null;
  return {
    draft,
    options,
    resource: resource.resource,
    summary: draft === null ? now : summarizeDraft(draft, labels),
  };
}

export interface ResourceStatusBadgeProps extends Omit<ComponentProps<"span">, "children"> {
  readonly summary: ResourceStatusSummary;
}

/**
 * A status as a small outline badge: its words carry the state, and `data-state` colours the dot
 * before them, `--calendar-busy` when busy and `--calendar-free` when free.
 */
export function ResourceStatusBadge({ className, summary, ...props }: ResourceStatusBadgeProps) {
  return (
    <Badge
      data-slot="resource-status"
      data-state={summary.state}
      // The whole status on hover, where a narrow column cuts it short.
      title={summary.text}
      variant="outline"
      className={cn(resourceStatusBadgeClass, className)}
      {...props}
    >
      <span aria-hidden className={resourceStatusDotClass} />
      {/* Its own direction, so a cut-short English status keeps its first word in RTL. */}
      <span dir="auto" className={resourceStatusTextClass}>
        {summary.text}
      </span>
    </Badge>
  );
}

/**
 * A header's status: the options' `DraftStatus` during a draft when it has one, the badge
 * otherwise; nothing while server rendering.
 */
export function ResourceStatusPart({
  className,
  status,
}: {
  readonly className?: string;
  readonly status: ResourceHeaderStatusValue;
}) {
  const { draft, options, resource, summary } = status;
  const { DraftStatus } = options;
  if (draft !== null && DraftStatus !== undefined) {
    return (
      <>
        <DraftStatus
          className={className}
          events={draft.events}
          outsideHours={draft.outsideHours}
          resource={resource}
        />
        {/* Your part draws the status as it likes; screen readers still hear it in words. */}
        {summary !== null && <span className={resourceStatusSpokenClass}>{summary.text}</span>}
      </>
    );
  }
  return summary === null ? null : <ResourceStatusBadge className={className} summary={summary} />;
}
