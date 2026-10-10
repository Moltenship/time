/**
 * PROTOTYPE for #119: the other looks from the research, each a composition of the registry's
 * annotation parts. Nothing in the time grid changes; a view takes the component as
 * `annotations.Annotations`, plus the rail numbers its layout needs.
 */
import {
  AnnotationMark,
  AnnotationRail,
  type TimeGridAnnotationOptions,
  type TimeGridAnnotationsProps,
} from "@registry/time-grid-view/time-grid-annotations";

import { annotationSources } from "./annotations";

/** Amie's desktop look: thin bars in a narrow gutter, without icons. */
function EdgeBars({ marks }: TimeGridAnnotationsProps) {
  return (
    <AnnotationRail>
      {marks.map((mark) => (
        <AnnotationMark key={mark.key} mark={mark} variant="bar" />
      ))}
    </AnnotationRail>
  );
}

/** A tint across the column behind events, labelled when long enough. */
function Bands({ marks }: TimeGridAnnotationsProps) {
  return (
    <AnnotationRail>
      {marks.map((mark) => (
        <AnnotationMark key={mark.key} mark={mark} variant="band">
          {mark.minutes >= 30 && mark.source.mergeGapMinutes === undefined && (
            <span className="absolute start-1 top-0.5 flex max-w-[calc(100%-0.5rem)] items-center gap-1 truncate text-[0.625rem] font-semibold text-calendar-event-foreground">
              <mark.source.Icon className="size-2.5 shrink-0" />
              {mark.items[0]!.title}
            </span>
          )}
        </AnnotationMark>
      ))}
    </AnnotationRail>
  );
}

/** One hairline per source, each in its own lane at the column's end. */
function SourceLanes({ marks }: TimeGridAnnotationsProps) {
  return (
    <AnnotationRail>
      {marks.map((mark) => (
        <AnnotationMark key={mark.key} mark={mark} variant="bar" className="rounded-[1px]" />
      ))}
    </AnnotationRail>
  );
}

export const customAnnotationStyles = {
  band: { Annotations: Bands, placement: "overlay" },
  edge: { Annotations: EdgeBars, rail: { markWidth: 4, width: 10 } },
  lanes: {
    Annotations: SourceLanes,
    rail: {
      layout: "per-source",
      markWidth: 2,
      side: "end",
      width: 4 + annotationSources.length * 3,
    },
  },
} satisfies Record<string, Partial<TimeGridAnnotationOptions>>;
