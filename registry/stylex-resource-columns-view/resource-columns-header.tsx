"use client";

import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import type {
  CalendarEnvironmentBase,
  ResourceColumn,
  VisibleResource,
} from "@moltenship/calendar";
import * as stylex from "@stylexjs/stylex";
import type { VirtualItem } from "@tanstack/react-virtual";
import { useMemo, type ComponentType, type ReactNode, type RefCallback } from "react";

import {
  draftStatusAttributes,
  useResourceHeaderStatus,
  type ResourceStatusOptions,
} from "@registry/stylex-calendar/resource-status";
import { calendarVars } from "@registry/stylex-calendar-theme/calendar-tokens.stylex";

import {
  DefaultResourceHeader,
  ResourceHeaderContext,
  type ResourceHeaderProps,
} from "./resource-header";

const styles = stylex.create({
  band: {
    backgroundColor: calendarVars["--muted"],
    flexShrink: 0,
  },
  cell: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
  },
  clip: {
    flex: "1",
    minWidth: 0,
    overflow: "clip",
    position: "relative",
  },
  columnHeader: {
    insetBlock: 0,
    position: "absolute",
  },
  corner: {
    alignItems: "flex-end",
    color: calendarVars["--calendar-axis"],
    display: "flex",
    flexShrink: 0,
    fontSize: "0.625rem",
    paddingBottom: "0.25rem",
    width: "var(--calendar-gutter-width)",
  },
  filler: {
    borderInlineStartColor: calendarVars["--calendar-grid"],
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: 1,
    flex: "1",
  },
  // A container, so header parts can fit themselves to the column's width.
  name: {
    alignItems: "center",
    borderInlineStartColor: calendarVars["--calendar-grid"],
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: 1,
    containerType: "inline-size",
    display: "flex",
    flexShrink: 0,
    gap: "0.25rem",
    paddingInline: "0.5rem",
  },
  nameExpanded: {
    backgroundColor: calendarVars["--muted"],
  },
  row: {
    display: "flex",
  },
  track: {
    height: "100%",
    position: "relative",
  },
});

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
    <div {...stylex.props(styles.cell)}>
      {groups.map((_, level) => (
        <div
          key={level}
          aria-hidden
          {...stylex.props(styles.band)}
          style={{ height: `${LEVEL}rem` }}
        />
      ))}
      <div
        data-slot="resource-header"
        {...draftStatusAttributes(headerStatus)}
        {...stylex.props(styles.name, expanded && styles.nameExpanded)}
        // Groups show no status, so their name row keeps the height their members' bands have.
        style={{ height: `${status !== null && !resource.hasChildren ? STATUS_ROW : LEVEL}rem` }}
      >
        <ResourceHeaderContext
          value={{ environment, groups, status: headerStatus, title, visible: resource }}
        >
          <ResourceHeader resource={resource.resource} title={title} />
        </ResourceHeaderContext>
        {groups.length > 0 && <VisuallyHidden>, {groups.join(", ")}</VisuallyHidden>}
      </div>
      <div
        {...stylex.props(styles.filler)}
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
      {...stylex.props(styles.row)}
      style={{ height: `${(levels - 1) * LEVEL + (status !== null ? STATUS_ROW : LEVEL)}rem` }}
    >
      <div role="columnheader" aria-colindex={1} {...stylex.props(styles.corner)}>
        {corner}
      </div>
      <div {...stylex.props(styles.clip)} style={{ marginInlineEnd: scrollbarWidth }}>
        <div ref={followX} {...stylex.props(styles.track)} style={{ width: totalSize }}>
          {items.map(({ index, key, size, start }) => {
            const { resource } = resources[index]!;
            return (
              <div
                key={key}
                role="columnheader"
                aria-colindex={2 + index * days}
                aria-colspan={days > 1 ? days : undefined}
                {...stylex.props(styles.columnHeader)}
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
