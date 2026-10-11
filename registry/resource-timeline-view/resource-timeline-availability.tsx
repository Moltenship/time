import type { TimelineExtent } from "@moltenship/calendar";

/** Well under a millisecond of a day, so stretches that only touch a cell never count. */
const EPSILON = 1e-9;

/** Whether any of `[start, end)`, as fractions of the timeline, is closed. */
export function isUnavailableIn(
  extents: readonly TimelineExtent[],
  start: number,
  end: number,
): boolean {
  return extents.some((extent) => extent.start < end - EPSILON && extent.end > start + EPSILON);
}

/**
 * Shading over a resource's closed time along an hour row, behind its bars: stretches of a
 * timeline `width` pixels wide after the resource column. Screen readers hear it in the cells'
 * names instead, so the shading is hidden from them.
 */
export function TimelineAvailability({
  extents,
  width,
}: {
  readonly extents: readonly TimelineExtent[];
  readonly width: number;
}) {
  return extents.map(({ end, start }) => (
    <div
      key={start}
      aria-hidden
      data-slot="resource-timeline-unavailable"
      className="pointer-events-none absolute inset-y-0 bg-calendar-unavailable"
      style={{
        insetInlineStart: `calc(var(--calendar-resource-column) + ${start * width}px)`,
        width: (end - start) * width,
      }}
    />
  ));
}
