"use client";

import type {
  CalendarEnvironmentBase,
  ResourceColumn,
  VisibleResource,
} from "@moltenship/calendar";
import type { VirtualItem } from "@tanstack/virtual-core";
import { useMemo, type ComponentType, type ReactNode, type RefCallback } from "react";

import {
  draftStatusAttributes,
  useResourceHeaderStatus,
  type ResourceStatusOptions,
} from "@registry/calendar/resource-status";
import {
  resourceGroupsWords,
  resourceTitle,
} from "@registry/shared/resource-columns-view/resource-columns-labels";
import {
  groupBandHeight,
  headerFillHeight,
  headerLevels,
  headerRowHeight,
  nameRowHeight,
  resourceColIndex,
  resourceGroupsOf,
} from "@registry/shared/resource-columns-view/resource-columns-layout";
import {
  resourceColumnsClipClass,
  resourceColumnsTrackClass,
  resourceGroupBandClass,
  resourceHeaderCellClass,
  resourceHeaderColumnClass,
  resourceHeaderFillClass,
  resourceHeaderRowClass,
  resourceNameRowClass,
} from "@registry/shared/resource-columns-view/resource-columns.styles";
import { srOnlyClass, timeGridCornerClass } from "@registry/shared/time-grid-view/time-grid.styles";

import {
  DefaultResourceHeader,
  ResourceHeaderContext,
  type ResourceHeaderProps,
} from "./resource-header";

export interface ResourceColumnsHeaderProps {
  /** The corner's contents over the gutter, such as `TimeGridGutterLabels`; a flex row. */
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

export { resourceTitle };

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
    <div className={resourceHeaderCellClass}>
      {groups.map((_, level) => (
        <div
          key={level}
          aria-hidden
          className={resourceGroupBandClass}
          style={{ height: groupBandHeight }}
        />
      ))}
      <div
        data-slot="resource-header"
        {...draftStatusAttributes(headerStatus)}
        className={resourceNameRowClass(expanded)}
        style={{ height: nameRowHeight(status !== null, resource.hasChildren) }}
      >
        <ResourceHeaderContext
          value={{ environment, groups, status: headerStatus, title, visible: resource }}
        >
          <ResourceHeader resource={resource.resource} title={title} />
        </ResourceHeaderContext>
        {groups.length > 0 && <span className={srOnlyClass}>{resourceGroupsWords(groups)}</span>}
      </div>
      <div
        className={resourceHeaderFillClass}
        style={{ minHeight: headerFillHeight(levels, depth) }}
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
  const groupsOf = useMemo(() => resourceGroupsOf(resources), [resources]);
  const levels = headerLevels(resources);

  return (
    <div
      role="row"
      className={resourceHeaderRowClass}
      style={{ height: headerRowHeight(levels, status !== null) }}
    >
      <div role="columnheader" aria-colindex={1} className={timeGridCornerClass}>
        {corner}
      </div>
      <div className={resourceColumnsClipClass} style={{ marginInlineEnd: scrollbarWidth }}>
        <div ref={followX} className={resourceColumnsTrackClass} style={{ width: totalSize }}>
          {items.map(({ index, key, size, start }) => {
            const { resource } = resources[index]!;
            return (
              <div
                key={key}
                role="columnheader"
                aria-colindex={resourceColIndex(index, days)}
                aria-colspan={days > 1 ? days : undefined}
                className={resourceHeaderColumnClass}
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
