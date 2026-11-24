import {
  projectTimeGridAnnotations,
  type TimeGridAnnotationGeometry,
  type TimeGridAnnotationMark,
  type TimeGridColumn,
} from "@moltenship/calendar-core";
import type { CalendarAnnotations } from "@moltenship/calendar-primitives";
import { createContext, useContext, useMemo, type Context } from "react";

export type { CalendarAnnotations };

/** The nearest root's annotations, shared by every factory so annotation hooks work in any view. */
export const CalendarAnnotationsContext: Context<CalendarAnnotations | null> =
  createContext<CalendarAnnotations | null>(null);

export function useCalendarAnnotations(): CalendarAnnotations {
  const annotations = useContext(CalendarAnnotationsContext);
  if (annotations === null) throw new Error("calendar-hook-outside-root");
  return annotations;
}

/**
 * The root's annotations laid out beside a time grid's columns, one list of marks per column; see
 * `projectTimeGridAnnotations`. Marks carry the root's source objects unchanged.
 */
export function useTimeGridAnnotations(
  columns: readonly TimeGridColumn[],
  { layout, maxLanes, minGap, minHeight }: TimeGridAnnotationGeometry = {},
): readonly (readonly TimeGridAnnotationMark[])[] {
  const { snapshot, sources } = useCalendarAnnotations();
  return useMemo(
    () =>
      projectTimeGridAnnotations(columns, snapshot, sources, {
        layout,
        maxLanes,
        minGap,
        minHeight,
      }),
    [columns, layout, maxLanes, minGap, minHeight, snapshot, sources],
  );
}
