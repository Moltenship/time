import {
  belongsInTimeGridAllDayRow,
  createCalendar,
  createCanonicalEventAdapter,
  defineCalendarView,
  layoutTimeGrid,
  navigateTimeGrid,
  queryVisibleEvents,
  splitEventsByDay,
  timeGridColumns,
  timeGridRange,
  timeGridTitle,
  type CalendarEvent,
  type CalendarResource,
  type CalendarViewProjectionInput,
} from "@moltenship/calendar";

import {
  ResourceColumnsView,
  type ResourceColumnsProjection,
  type ResourceColumnsViewOptions,
} from "../resource-columns-view/resource-columns-view";

export type StaffEvent = CalendarEvent<null, string, string>;

export function shift(id: string, resourceIds: readonly string[], start: string, end: string) {
  return {
    data: null,
    end: Temporal.Instant.from(end),
    id,
    kind: "timed",
    resourceIds,
    start: Temporal.Instant.from(start),
    title: id,
  } as const satisfies StaffEvent;
}

/** `count` people, named "Person 1" onwards. */
export function people(count: number): CalendarResource<null>[] {
  return Array.from({ length: count }, (_, index) => ({
    data: null,
    id: `p${index + 1}`,
    title: `Person ${index + 1}`,
  }));
}

/**
 * Stands in for the resource-columns projection until the core provides it: a column per
 * resource, in input order, with every group expanded.
 */
function projectResources(
  input: CalendarViewProjectionInput<unknown, StaffEvent>,
): ResourceColumnsProjection<StaffEvent> {
  const { range, snapshot, today } = input;
  const { timeZone } = input.environment;
  const resources = input.resources as readonly CalendarResource<null>[];
  const parents = new Set(resources.map(({ parentId }) => parentId));
  const depthOf = (resource: CalendarResource<null>): number => {
    const parent = resources.find(({ id }) => id === resource.parentId);
    return parent === undefined ? 0 : depthOf(parent) + 1;
  };
  const timed = splitEventsByDay(queryVisibleEvents(snapshot, range, timeZone), range, timeZone)
    .filter((fragment) => !belongsInTimeGridAllDayRow(fragment.event))
    .filter((fragment) => fragment.event.resourceIds.length > 0);
  const columns = timeGridColumns(range, timeZone);

  return {
    resources: resources.map((resource) => {
      const layouts = layoutTimeGrid(
        columns,
        timed.filter((fragment) => fragment.event.resourceIds.includes(resource.id)),
        { minHeight: 15 / (24 * 60) },
      );
      return {
        days: columns.map((column, index) => ({
          column,
          events: layouts[index]!,
          isToday: today !== null && column.date.equals(today),
        })),
        heading: {
          depth: depthOf(resource),
          expanded: parents.has(resource.id) ? true : undefined,
          id: resource.id,
          parentId: resource.parentId,
          title: resource.title,
        },
      };
    }),
  };
}

const resourceDayView = defineCalendarView({
  defaultOptions: {} as ResourceColumnsViewOptions<StaffEvent>,
  name: "resources",
  strategy: {
    getRange: (anchor, environment) =>
      timeGridRange(anchor, { count: 1, kind: "days" }, environment.weekRules),
    getTitle: (range, environment) => timeGridTitle(range, environment.locale),
    navigate: (anchor, delta) => navigateTimeGrid(anchor, delta, { count: 1, kind: "days" }),
    project: projectResources,
  },
  Renderer: ResourceColumnsView<StaffEvent>,
});

export const ResourceCalendar = createCalendar<StaffEvent, CalendarResource<null>>()({
  eventAdapter: createCanonicalEventAdapter<null, string, string>(),
  views: [resourceDayView],
});
