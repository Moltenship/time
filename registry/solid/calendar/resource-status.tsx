import {
  useDraftBusy,
  useNow,
  useResourceStatus,
  type CalendarDraftBusy,
  type CalendarEnvironmentBase,
  type CalendarResource,
  type ResourceId,
} from "@moltenship/calendar-solid";
import { createComponent, type JSX } from "@solidjs/web";
import { createMemo, omit, Show, type Accessor, type Component } from "solid-js";

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
  readonly class?: string;
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
   * update on every step.
   */
  readonly DraftStatus?: Component<ResourceDraftStatusProps>;
}

type Environment = Pick<CalendarEnvironmentBase, "locale" | "timeZone">;

/**
 * A resource's status now on the calendar's clock, in words: "until 3:00 PM" on the display
 * clock, with the weekday within the next six days, and the date further out. `null` while
 * server rendering, and for a `null` resource.
 */
export function useResourceStatusSummary(
  environment: Accessor<Environment>,
  resourceId: Accessor<ResourceId | null>,
  labels: Accessor<ResourceStatusLabels> = () => resourceStatusLabels,
): Accessor<ResourceStatusSummary | null> {
  const status = useResourceStatus(resourceId);
  // The status changes only at its own instants; the clock tells "3:00 PM" from "Mon 3:00 PM".
  const now = useNow();
  const formats = createMemo(() => resourceStatusFormats(environment()));
  return createMemo(() => {
    const current = status();
    const instant = now();
    if (current === null || instant === null) return null;
    const until = resourceStatusUntil(formats(), instant, environment().timeZone);
    return summarizeResourceStatus(current, until, labels());
  });
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
  environment: Accessor<Environment>,
  resource: Accessor<{
    readonly hasChildren: boolean;
    readonly id: ResourceId | null;
    readonly resource: CalendarResource<unknown, ResourceId> | null;
  }>,
  options: Accessor<ResourceStatusOptions | null>,
): Accessor<ResourceHeaderStatusValue | null> {
  const shown = () => (options() !== null && !resource().hasChildren ? resource().id : null);
  const labels = createMemo(() => ({ ...resourceStatusLabels, ...options()?.labels }));
  const draft = useDraftBusy(shown);
  const now = useResourceStatusSummary(environment, shown, labels);
  return createMemo(() => {
    const current = options();
    if (current === null || shown() === null) return null;
    const during = draft();
    return {
      draft: during,
      options: current,
      resource: resource().resource,
      summary: during === null ? now() : summarizeDraft(during, labels()),
    };
  });
}

export interface ResourceStatusBadgeProps extends Omit<
  JSX.HTMLAttributes<HTMLSpanElement>,
  "children"
> {
  readonly summary: ResourceStatusSummary;
}

/**
 * A status as a small outline badge: its words carry the state, and `data-state` colours the dot
 * before them, `--calendar-busy` when busy and `--calendar-free` when free.
 */
export function ResourceStatusBadge(props: ResourceStatusBadgeProps) {
  const rest = omit(props, "class", "summary");
  return (
    <Badge
      data-slot="resource-status"
      data-state={props.summary.state}
      // The whole status on hover, where a narrow column cuts it short.
      title={props.summary.text}
      variant="outline"
      class={cn(resourceStatusBadgeClass, props.class)}
      {...rest}
    >
      <span aria-hidden="true" class={resourceStatusDotClass} />
      {/* Its own direction, so a cut-short English status keeps its first word in RTL. */}
      <span dir="auto" class={resourceStatusTextClass}>
        {props.summary.text}
      </span>
    </Badge>
  );
}

/**
 * A header's status: the options' `DraftStatus` during a draft when it has one, the badge
 * otherwise; nothing while server rendering.
 */
export function ResourceStatusPart(props: {
  readonly class?: string;
  readonly status: ResourceHeaderStatusValue;
}) {
  const DraftStatus = () =>
    props.status.draft === null ? undefined : props.status.options.DraftStatus;
  return (
    <Show
      when={DraftStatus()}
      fallback={
        <Show when={props.status.summary}>
          {(summary) => <ResourceStatusBadge class={props.class} summary={summary()} />}
        </Show>
      }
    >
      {(part) => (
        <>
          {createComponent(part(), {
            get class() {
              return props.class;
            },
            get events() {
              return props.status.draft?.events ?? [];
            },
            get outsideHours() {
              return props.status.draft?.outsideHours ?? false;
            },
            get resource() {
              return props.status.resource;
            },
          })}
          {/* Your part draws the status as it likes; screen readers still hear it in words. */}
          <Show when={props.status.summary}>
            {(summary) => <span class={resourceStatusSpokenClass}>{summary().text}</span>}
          </Show>
        </>
      )}
    </Show>
  );
}
