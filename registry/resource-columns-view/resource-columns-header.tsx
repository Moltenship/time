import type {
  CalendarEnvironmentBase,
  ResourceColumn,
  VisibleResource,
} from "@moltenship/calendar";
import type { VirtualItem } from "@tanstack/react-virtual";
import { useMemo, type ComponentType, type ReactNode, type RefCallback } from "react";

import {
  draftStatusAttributes,
  useResourceHeaderStatus,
  type ResourceStatusOptions,
} from "@registry/calendar/resource-status";
import { cn } from "cn";

import {
  DefaultResourceHeader,
  ResourceHeaderContext,
  type ResourceHeaderProps,
} from "./resource-header";

export interface ResourceColumnsHeaderProps {
  /** The corner over the gutter, such as the time zone's offset. */
  readonly corner: ReactNode;
  /** Day columns per resource; each is one `aria-colindex` step after the gutter. */
  readonly days: number;
  /** The calendar's locale and display time zone, for each resource's local time. */
  readonly environment: Pick<CalendarEnvironmentBase, "locale" | "timeZone">;
  /** Follows the body's sideways scroll; see `useAxisSync`. */
  readonly followX: RefCallback<HTMLElement>;
  /** The rendered columns, from the column virtualizer. */
  readonly items: readonly VirtualItem[];
  /** Draws each resource's name row; see the view's `ResourceHeader`. */
  readonly ResourceHeader?: ComponentType<ResourceHeaderProps>;
  readonly resources: readonly ResourceColumn<unknown>[];
  readonly scrollbarWidth: number;
  /** How headers show each resource's status; `null` without it. */
  readonly status: ResourceStatusOptions | null;
  readonly totalSize: number;
}

/** Height of one hierarchy level, in rem. */
const LEVEL = 2;
/** A name row with room for the status badge under the name, in rem. */
const STATUS_ROW = 2.75;

/** A resource's name, or "Unassigned" for the bucket of events without resources. */
export function resourceTitle({ resource }: VisibleResource): string {
  return resource?.title ?? "Unassigned";
}

/**
 * One column's header. A resource sits on the row for its depth, under a band for each group it
 * belongs to. An expanded group's own column starts its band, so the band names the group over
 * all of its columns; a collapsed group shows its name with a closed chevron. `ResourceHeader`
 * draws the name row; the bands, sizes and the group names screen readers hear stay here.
 */
function ResourceHeaderCell({
  environment,
  groups,
  levels,
  resource,
  ResourceHeader,
  status,
}: {
  readonly environment: Pick<CalendarEnvironmentBase, "locale" | "timeZone">;
  /** Names of the groups the resource sits in, outermost first. */
  readonly groups: readonly string[];
  readonly levels: number;
  readonly resource: VisibleResource;
  readonly ResourceHeader: ComponentType<ResourceHeaderProps>;
  readonly status: ResourceStatusOptions | null;
}) {
  const { depth, expanded } = resource;
  const title = resourceTitle(resource);
  const headerStatus = useResourceHeaderStatus(environment, resource, status);

  return (
    <div className="flex h-full flex-col">
      {groups.map((_, level) => (
        <div
          key={level}
          aria-hidden
          className="shrink-0 bg-muted"
          style={{ height: `${LEVEL}rem` }}
        />
      ))}
      <div
        data-slot="resource-header"
        {...draftStatusAttributes(headerStatus)}
        className={cn(
          // A container, so header parts can fit themselves to the column's width.
          "@container flex shrink-0 items-center gap-1 border-s border-calendar-grid px-2",
          expanded && "bg-muted",
        )}
        // Groups show no status, so their name row keeps the height their members' bands have.
        style={{ height: `${status !== null && !resource.hasChildren ? STATUS_ROW : LEVEL}rem` }}
      >
        <ResourceHeaderContext
          value={{ environment, groups, status: headerStatus, title, visible: resource }}
        >
          <ResourceHeader resource={resource.resource} title={title} />
        </ResourceHeaderContext>
        {groups.length > 0 && <span className="sr-only">, {groups.join(", ")}</span>}
      </div>
      <div
        className="flex-1 border-s border-calendar-grid"
        style={{ minHeight: `${(levels - depth - 1) * LEVEL}rem` }}
      />
    </div>
  );
}

/**
 * The header row: the corner over the gutter, then a header per rendered resource column,
 * grouped by the resource hierarchy. Collapsing a group hides its columns.
 */
export function ResourceColumnsHeader({
  corner,
  days,
  environment,
  followX,
  items,
  ResourceHeader = DefaultResourceHeader,
  resources,
  scrollbarWidth,
  status,
  totalSize,
}: ResourceColumnsHeaderProps) {
  // A visible resource's parents are visible too, so its groups are found among the columns.
  const byId = useMemo(
    () => new Map(resources.map(({ resource }) => [resource.id, resource] as const)),
    [resources],
  );
  const levels = resources.reduce(
    (deepest, { resource }) => Math.max(deepest, resource.depth + 1),
    1,
  );
  const groupsOf = (resource: VisibleResource) => {
    const groups: string[] = [];
    for (let parentId = resource.parentId; parentId !== null;) {
      const parent = byId.get(parentId);
      if (parent === undefined) break;
      groups.unshift(resourceTitle(parent));
      parentId = parent.parentId;
    }
    return groups;
  };

  return (
    <div
      role="row"
      className="flex"
      style={{ height: `${(levels - 1) * LEVEL + (status !== null ? STATUS_ROW : LEVEL)}rem` }}
    >
      <div
        role="columnheader"
        aria-colindex={1}
        className="flex w-(--calendar-gutter-width) shrink-0 items-end justify-end pe-2 pb-1 text-[0.625rem] text-calendar-axis"
      >
        {corner}
      </div>
      <div
        className="relative min-w-0 flex-1 overflow-clip"
        style={{ marginInlineEnd: scrollbarWidth }}
      >
        <div ref={followX} className="relative h-full" style={{ width: totalSize }}>
          {items.map(({ index, key, size, start }) => {
            const { resource } = resources[index]!;
            return (
              <div
                key={key}
                role="columnheader"
                aria-colindex={2 + index * days}
                aria-colspan={days > 1 ? days : undefined}
                className="absolute inset-y-0"
                style={{ insetInlineStart: start, width: size }}
              >
                <ResourceHeaderCell
                  environment={environment}
                  groups={groupsOf(resource)}
                  levels={levels}
                  resource={resource}
                  ResourceHeader={ResourceHeader}
                  status={status}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
