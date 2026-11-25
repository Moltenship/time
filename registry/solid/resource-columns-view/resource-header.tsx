import {
  useResourceExpansion,
  type CalendarEnvironmentBase,
  type CalendarResource,
  type ResourceId,
  type VisibleResource,
} from "@moltenship/calendar-solid";
import type { JSX } from "@solidjs/web";
import { createContext, omit, Show, useContext } from "solid-js";

import {
  ResourceStatusPart,
  type ResourceHeaderStatusValue,
} from "@registry/calendar/resource-status";
import { ResourceTime } from "@registry/calendar/resource-time";
import { ChevronRightIcon } from "@registry/calendar-ui/icons";
import {
  groupToggleLabel,
  statusSeparator,
} from "@registry/shared/resource-columns-view/resource-columns-labels";
import {
  defaultResourceHeaderStatusRowClass,
  defaultResourceHeaderStatusTimeClass,
  defaultResourceHeaderTextClass,
  resourceGroupChevronClass,
  resourceGroupToggleClass,
  resourceHeaderIconClass,
  resourceHeaderTimeClass,
  resourceHeaderTitleClass,
} from "@registry/shared/resource-columns-view/resource-columns.styles";
import { srOnlyClass } from "@registry/shared/time-grid-view/time-grid.styles";
import { cn } from "cn";

/** What the view hands a resource header; the parts read the rest through `useResourceHeader`. */
export interface ResourceHeaderProps<
  TResource extends CalendarResource<unknown, ResourceId> = CalendarResource<unknown, ResourceId>,
> {
  /** The resource, or `null` for the Unassigned column. */
  readonly resource: TResource | null;
  /** The resource's name, or "Unassigned". */
  readonly title: string;
}

/** The header's resource and what the parts show of it. Its fields follow the header. */
export interface ResourceHeaderContextValue {
  /** The calendar's locale and display time zone. */
  readonly environment: Pick<CalendarEnvironmentBase, "locale" | "timeZone">;
  /** Names of the groups the resource sits in, outermost first. */
  readonly groups: readonly string[];
  /**
   * The resource's status, now or during a draft, with the view's `resourceStatus`; `null`
   * without it, for a group, or for the Unassigned column.
   */
  readonly status: ResourceHeaderStatusValue | null;
  readonly title: string;
  readonly visible: VisibleResource;
}

export const ResourceHeaderContext = createContext<ResourceHeaderContextValue | undefined>(
  undefined,
);

/** The header's resource, its name and its groups, for parts inside a resource header. */
export function useResourceHeader(): ResourceHeaderContextValue {
  const context = useContext(ResourceHeaderContext);
  if (context === undefined) {
    throw new Error("useResourceHeader is for parts inside a resource header.");
  }
  return context;
}

function GroupToggle(props: { readonly id: ResourceId; readonly title: string }) {
  const { expanded, toggle } = useResourceExpansion(() => props.id);

  return (
    <button
      aria-expanded={expanded() ? "true" : "false"}
      aria-label={groupToggleLabel(expanded(), props.title)}
      class={resourceGroupToggleClass}
      onClick={() => toggle()}
      // The grid keeps one tab stop.
      tabindex={-1}
      type="button"
    >
      <ChevronRightIcon aria-hidden="true" class={resourceGroupChevronClass(expanded())} />
    </button>
  );
}

/** The chevron that shows or hides a group's columns; nothing for a resource without children. */
export function ResourceHeaderToggle() {
  const header = useResourceHeader();
  return (
    // An ID can be 0, so the check doesn't pass the ID itself.
    <Show when={header.visible.hasChildren && header.visible.id !== null}>
      <GroupToggle id={header.visible.id!} title={header.title} />
    </Show>
  );
}

/**
 * Something drawn before the name, such as a person's avatar or a room's icon. Screen readers skip
 * it, since the name beside it already says who or what the column is.
 */
export function ResourceHeaderIcon(props: JSX.HTMLAttributes<HTMLSpanElement>) {
  const rest = omit(props, "class");
  return (
    <span
      aria-hidden="true"
      data-slot="resource-header-icon"
      class={cn(resourceHeaderIconClass, props.class)}
      {...rest}
    />
  );
}

/** The resource's name, cut short with an ellipsis; hovering shows it whole. Children replace it. */
export function ResourceHeaderTitle(props: JSX.HTMLAttributes<HTMLSpanElement>) {
  const header = useResourceHeader();
  const rest = omit(props, "children", "class");
  return (
    <span
      data-slot="resource-header-title"
      class={cn(resourceHeaderTitleClass(header.visible.id === null), props.class)}
      title={header.title}
      {...rest}
    >
      {props.children ?? header.title}
    </span>
  );
}

/**
 * The resource's local time and UTC offset, while its `timeZone` keeps a different clock from the
 * display time zone; nothing otherwise.
 */
export function ResourceHeaderTime(props: Omit<JSX.HTMLAttributes<HTMLSpanElement>, "children">) {
  const header = useResourceHeader();
  const rest = omit(props, "class");
  return (
    <ResourceTime
      // The header's name runs on from the resource's: "Leo, local time 5:30 PM".
      separator
      class={cn(resourceHeaderTimeClass, props.class)}
      environment={header.environment}
      timeZone={header.visible.resource?.timeZone}
      {...rest}
    />
  );
}

/**
 * The resource's status, with the view's `resourceStatus`, which makes room for it: during a
 * draft, whether it's busy or outside its hours then, and otherwise now, such as "Busy until
 * 3:00 PM", as a badge or the option's `DraftStatus`. Nothing without it, for a group, whose own
 * bookings aren't its members', for the Unassigned column, or while server rendering.
 */
export function ResourceHeaderStatus(props: { readonly class?: string }) {
  const header = useResourceHeader();
  const shown = () => {
    const { status } = header;
    return status === null || (status.summary === null && status.draft === null) ? null : status;
  };
  return (
    <Show when={shown()}>
      {(status) => (
        <>
          {/* Read after the name and local time, which the header's name runs on from. */}
          <span class={srOnlyClass}>{statusSeparator}</span>
          <ResourceStatusPart class={props.class} status={status()} />
        </>
      )}
    </Show>
  );
}

/**
 * The default composition: a group's chevron, then the name, with the local time under it for a
 * resource in another time zone and, with the view's `resourceStatus`, its status after that.
 */
export function DefaultResourceHeader() {
  const header = useResourceHeader();
  return (
    <>
      <ResourceHeaderToggle />
      <span class={defaultResourceHeaderTextClass}>
        <ResourceHeaderTitle />
        <Show when={header.status !== null} fallback={<ResourceHeaderTime />}>
          <span class={defaultResourceHeaderStatusRowClass}>
            {/* The name still reads the time first. */}
            <ResourceHeaderTime class={defaultResourceHeaderStatusTimeClass} />
            <ResourceHeaderStatus />
          </span>
        </Show>
      </span>
    </>
  );
}
