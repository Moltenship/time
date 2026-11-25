import {
  projectTimeGridAnnotations,
  type TimeGridAnnotationGeometry,
  type TimeGridAnnotationMark,
  type TimeGridColumn,
} from "@moltenship/calendar-core";
import type { CalendarAnnotations } from "@moltenship/calendar-primitives";
import { createMemo, type Accessor } from "solid-js";

import { access, useShared, type MaybeAccessor } from "./shared";

export type { CalendarAnnotations };

/** The root's annotations and their sources, as an accessor. Works inside any calendar's root. */
export function useCalendarAnnotations(): Accessor<CalendarAnnotations> {
  return useShared().annotations;
}

/**
 * The root's annotations laid out beside a time grid's columns, one list of marks per column, as
 * an accessor; see `projectTimeGridAnnotations`. Marks carry the root's source objects unchanged.
 */
export function useTimeGridAnnotations(
  columns: MaybeAccessor<readonly TimeGridColumn[]>,
  geometry: MaybeAccessor<TimeGridAnnotationGeometry> = {},
): Accessor<readonly (readonly TimeGridAnnotationMark[])[]> {
  const { annotations } = useShared();
  return createMemo(() => {
    const { snapshot, sources } = annotations();
    const { layout, maxLanes, minGap, minHeight } = access(geometry);
    return projectTimeGridAnnotations(access(columns), snapshot, sources, {
      layout,
      maxLanes,
      minGap,
      minHeight,
    });
  });
}
