import {
  projectTimeGridAnnotations,
  type AnnotationSnapshot,
  type CalendarAnnotationSource,
  type TimeGridAnnotationGeometry,
  type TimeGridAnnotationMark,
  type TimeGridColumn,
} from "@moltenship/calendar-core";
import { createContext, useContext, useMemo, type Context } from "react";

/** The root's annotations and the sources it shows. */
export interface CalendarAnnotations {
  readonly snapshot: AnnotationSnapshot;
  readonly sources: readonly CalendarAnnotationSource[];
}

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
 * `projectTimeGridAnnotations`. `TSource` is the source type given to the root's
 * `annotationSources`, whose objects the marks carry unchanged.
 */
export function useTimeGridAnnotations<
  TSource extends CalendarAnnotationSource = CalendarAnnotationSource,
>(
  columns: readonly TimeGridColumn[],
  { layout, maxLanes, minGap, minHeight }: TimeGridAnnotationGeometry = {},
): readonly (readonly TimeGridAnnotationMark<TSource>[])[] {
  const { snapshot, sources } = useCalendarAnnotations();
  return useMemo(
    () =>
      projectTimeGridAnnotations(columns, snapshot, sources as readonly TSource[], {
        layout,
        maxLanes,
        minGap,
        minHeight,
      }),
    [columns, layout, maxLanes, minGap, minHeight, snapshot, sources],
  );
}
