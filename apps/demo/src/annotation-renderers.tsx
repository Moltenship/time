/**
 * PROTOTYPE for #119: the other looks from the research, built only with the time grid's public
 * annotation options (`rail`, `placement`, `renderMark`). Each renderer spreads the props it gets,
 * which place the mark and wire the tooltip and popover.
 */
import type {
  TimeGridAnnotationOptions,
  TimeGridAnnotationRenderer,
} from "@registry/time-grid-view/time-grid-annotations";
import { cn } from "cn";

import { annotationSources } from "./annotations";

/** Amie's desktop look: thin capsules in a narrow gutter, without icons. */
const edgeBar: TimeGridAnnotationRenderer = (mark, props) => (
  <div
    {...props}
    className={cn(
      props.className,
      "rounded-full bg-calendar-event-border",
      mark.startsBeforeDay && "rounded-t-none",
      mark.endsAfterDay && "rounded-b-none",
    )}
  />
);

/** A tint across the whole column behind events, labelled when long enough. */
const band: TimeGridAnnotationRenderer = (mark, props) => (
  <div
    {...props}
    className={cn(
      props.className,
      "border-s-2 border-calendar-event-border bg-calendar-event-border/12 hover:bg-calendar-event-border/24",
    )}
  >
    {mark.minutes >= 30 && mark.source.mergeGapMinutes === undefined && (
      <span className="absolute start-1 top-0.5 flex max-w-[calc(100%-0.5rem)] items-center gap-1 truncate text-[0.625rem] font-semibold text-calendar-event-foreground">
        <mark.source.Icon className="size-2.5 shrink-0" />
        {mark.items[0]!.title}
      </span>
    )}
  </div>
);

/** One hairline per source, each in its own lane. */
const hairline: TimeGridAnnotationRenderer = (_mark, props) => (
  <div {...props} className={cn(props.className, "rounded-[1px] bg-calendar-event-border")} />
);

export const customAnnotationStyles = {
  band: { placement: "overlay", renderMark: band },
  edge: { rail: { markWidth: 4, width: 10 }, renderMark: edgeBar },
  lanes: {
    rail: {
      layout: "per-source",
      markWidth: 2,
      side: "end",
      width: 4 + annotationSources.length * 3,
    },
    renderMark: hairline,
  },
} satisfies Record<string, Partial<TimeGridAnnotationOptions>>;
