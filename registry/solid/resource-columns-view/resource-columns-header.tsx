import type {
  CalendarEnvironmentBase,
  ResourceColumn,
  VisibleResource,
} from "@moltenship/calendar-solid";
import { createComponent, type JSX } from "@solidjs/web";
import type { VirtualItem } from "@tanstack/virtual-core";
import { createMemo, For, Show, type Component } from "solid-js";

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
  type ResourceHeaderContextValue,
  type ResourceHeaderProps,
} from "./resource-header";
import type { AxisFollower } from "./use-axis-sync";

export { resourceTitle };

type Environment = Pick<CalendarEnvironmentBase, "locale" | "timeZone">;

export interface ResourceColumnsHeaderProps {
  /** The corner's contents over the gutter, such as `TimeGridGutterLabels`; a flex row. */
  readonly corner: JSX.Element;
  /** Day columns per resource; each is one `aria-colindex` step after the gutter. */
  readonly days: number;
  /** The calendar's locale and display time zone, for each resource's local time. */
  readonly environment: Environment;
  /** Follows the body's sideways scroll; see `useAxisSync`. */
  readonly followX: AxisFollower;
  /** The rendered columns, from the column virtualizer. */
  readonly items: readonly VirtualItem[];
  /** Draws each resource's name row; see the view's `ResourceHeader`. */
  readonly ResourceHeader?: Component<ResourceHeaderProps>;
  readonly resources: readonly ResourceColumn<unknown>[];
  readonly scrollbarWidth: number;
  /** How headers show each resource's status; `null` without it. */
  readonly status: ResourceStatusOptions | null;
  readonly totalSize: number;
}

/**
 * One column's header. A resource sits on the row for its depth, under a band for each group it
 * belongs to. An expanded group's own column starts its band, so the band names the group over
 * all of its columns; a collapsed group shows its name with a closed chevron. `ResourceHeader`
 * draws the name row; the bands, sizes and the group names screen readers hear stay here.
 */
function ResourceHeaderCell(props: {
  readonly environment: Environment;
  /** Names of the groups the resource sits in, outermost first. */
  readonly groups: readonly string[];
  readonly levels: number;
  readonly resource: VisibleResource;
  readonly ResourceHeader: Component<ResourceHeaderProps>;
  readonly status: ResourceStatusOptions | null;
}) {
  const title = () => resourceTitle(props.resource);
  const headerStatus = useResourceHeaderStatus(
    () => props.environment,
    () => props.resource,
    () => props.status,
  );
  const context: ResourceHeaderContextValue = {
    get environment() {
      return props.environment;
    },
    get groups() {
      return props.groups;
    },
    get status() {
      return headerStatus();
    },
    get title() {
      return title();
    },
    get visible() {
      return props.resource;
    },
  };

  return (
    <div class={resourceHeaderCellClass}>
      <For each={props.groups} keyed={false}>
        {() => (
          <div
            aria-hidden="true"
            class={resourceGroupBandClass}
            style={{ height: groupBandHeight }}
          />
        )}
      </For>
      <div
        data-slot="resource-header"
        {...draftStatusAttributes(headerStatus())}
        class={resourceNameRowClass(props.resource.expanded)}
        style={{ height: nameRowHeight(props.status !== null, props.resource.hasChildren) }}
      >
        <ResourceHeaderContext value={context}>
          {createComponent(props.ResourceHeader, {
            get resource() {
              return props.resource.resource;
            },
            get title() {
              return title();
            },
          })}
        </ResourceHeaderContext>
        <Show when={props.groups.length > 0}>
          <span class={srOnlyClass}>{resourceGroupsWords(props.groups)}</span>
        </Show>
      </div>
      <div
        class={resourceHeaderFillClass}
        style={{ "min-height": headerFillHeight(props.levels, props.resource.depth) }}
      />
    </div>
  );
}

/**
 * The header row: the corner over the gutter, then a header per rendered resource column,
 * grouped by the resource hierarchy. Collapsing a group hides its columns.
 */
export function ResourceColumnsHeader(props: ResourceColumnsHeaderProps) {
  const groupsOf = createMemo(() => resourceGroupsOf(props.resources));
  const levels = createMemo(() => headerLevels(props.resources));
  const track = props.followX();

  return (
    <div
      role="row"
      class={resourceHeaderRowClass}
      style={{ height: headerRowHeight(levels(), props.status !== null) }}
    >
      <div role="columnheader" aria-colindex={1} class={timeGridCornerClass}>
        {props.corner}
      </div>
      <div
        class={resourceColumnsClipClass}
        style={{ "margin-inline-end": `${props.scrollbarWidth}px` }}
      >
        <div
          ref={track}
          class={resourceColumnsTrackClass}
          style={{ width: `${props.totalSize}px` }}
        >
          <For each={props.items} keyed={(item) => item.key}>
            {(item) => {
              const resource = () => props.resources[item().index]!.resource;
              return (
                <div
                  role="columnheader"
                  aria-colindex={resourceColIndex(item().index, props.days)}
                  aria-colspan={props.days > 1 ? props.days : undefined}
                  class={resourceHeaderColumnClass}
                  style={{
                    "inset-inline-start": `${item().start}px`,
                    width: `${item().size}px`,
                  }}
                >
                  <ResourceHeaderCell
                    environment={props.environment}
                    groups={groupsOf()(resource())}
                    levels={levels()}
                    resource={resource()}
                    ResourceHeader={props.ResourceHeader ?? DefaultResourceHeader}
                    status={props.status}
                  />
                </div>
              );
            }}
          </For>
        </div>
      </div>
    </div>
  );
}
