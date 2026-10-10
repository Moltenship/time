import { isAnnotationId, isResourceId, type AnnotationId, type ResourceId } from "../ids";
import { createIntervalIndex, type IntervalIndexEntry } from "../internal/interval-index";
import type { AnnotationSnapshot, AnnotationSnapshotIssue, CalendarAnnotation } from "./types";

function isAnnotation(value: unknown): value is CalendarAnnotation {
  if (typeof value !== "object" || value === null) return false;
  const { end, resourceIds, sourceId, start, title } = value as Partial<CalendarAnnotation>;
  return (
    start instanceof Temporal.Instant &&
    end instanceof Temporal.Instant &&
    typeof sourceId === "string" &&
    sourceId.length > 0 &&
    typeof title === "string" &&
    (resourceIds === undefined ||
      (Array.isArray(resourceIds) && resourceIds.every((id) => isResourceId(id))))
  );
}

/**
 * Validates and indexes annotations. Invalid ones are skipped and reported in `issues`, as are
 * repeated IDs after their first use; the calendar never throws over annotation data.
 */
export function createAnnotationSnapshot<
  TData = unknown,
  TResourceId extends ResourceId = ResourceId,
>(
  input: readonly CalendarAnnotation<TData, TResourceId>[],
): AnnotationSnapshot<TData, TResourceId> {
  const annotations: CalendarAnnotation<TData, TResourceId>[] = [];
  const byId = new Map<AnnotationId, CalendarAnnotation<TData, TResourceId>>();
  const issues: AnnotationSnapshotIssue[] = [];
  const entries: IntervalIndexEntry<CalendarAnnotation<TData, TResourceId>>[] = [];

  input.forEach((annotation, index) => {
    const issue = (code: AnnotationSnapshotIssue["code"]) =>
      issues.push(Object.freeze({ annotation, code, index }));
    if (!isAnnotationId((annotation as { id?: unknown } | null)?.id))
      return issue("invalid-annotation-id");
    if (!isAnnotation(annotation)) return issue("invalid-annotation");
    if (Temporal.Instant.compare(annotation.start, annotation.end) >= 0) {
      return issue("start-not-before-end");
    }
    if (byId.has(annotation.id)) return issue("duplicate-annotation-id");
    byId.set(annotation.id, annotation);
    entries.push({
      end: annotation.end.epochNanoseconds,
      order: annotations.length,
      start: annotation.start.epochNanoseconds,
      value: annotation,
    });
    annotations.push(annotation);
  });

  const index = createIntervalIndex(entries);
  return Object.freeze({
    annotations: Object.freeze(annotations),
    get: (id: AnnotationId) => byId.get(id),
    issues: Object.freeze(issues),
    query: (start: Temporal.Instant, end: Temporal.Instant) =>
      index.query(start.epochNanoseconds, end.epochNanoseconds),
  });
}
