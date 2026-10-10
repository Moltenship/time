import type { AnnotationId, ResourceId } from "../ids";

/**
 * Time-based information shown beside events without being one: a listening session, a night's
 * sleep, a focus block. Annotations are read-only and never take part in event layout. Like
 * events, they are half-open, `[start, end)`. `TResourceId` defaults to `never`, so annotations
 * without resources fit any calendar.
 */
export interface CalendarAnnotation<TData = unknown, TResourceId extends ResourceId = never> {
  readonly id: AnnotationId;
  /** The `CalendarAnnotationSource` it belongs to; annotations of unknown sources are not shown. */
  readonly sourceId: string;
  readonly start: Temporal.Instant;
  readonly end: Temporal.Instant;
  readonly title: string;
  /** Resources it belongs to; without them it belongs to the whole calendar. */
  readonly resourceIds?: readonly TResourceId[];
  /** Anything the app's renderers need, such as an artist or a sleep score. */
  readonly data?: TData;
}

/** Where annotations come from, such as an integration. Views group, merge and name them by it. */
export interface CalendarAnnotationSource {
  readonly id: string;
  /** Names the source in summaries and tooltips: "Spotify", "Sleep". */
  readonly label: string;
  /** Items closer than this merge into one mark, such as tracks into a listening session. */
  readonly mergeGap?: Temporal.Duration;
}

export interface AnnotationSnapshotIssue {
  readonly annotation: unknown;
  readonly code:
    | "duplicate-annotation-id"
    | "invalid-annotation"
    | "invalid-annotation-id"
    | "start-not-before-end";
  readonly index: number;
}

/** Valid annotations in input order, indexed by time. Built once per annotation array. */
export interface AnnotationSnapshot<TData = unknown, TResourceId extends ResourceId = ResourceId> {
  readonly annotations: readonly CalendarAnnotation<TData, TResourceId>[];
  readonly issues: readonly AnnotationSnapshotIssue[];
  get(id: AnnotationId): CalendarAnnotation<TData, TResourceId> | undefined;
  /** Annotations intersecting `[start, end)`, in input order. */
  query(
    start: Temporal.Instant,
    end: Temporal.Instant,
  ): readonly CalendarAnnotation<TData, TResourceId>[];
}
