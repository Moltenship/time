/**
 * PROTOTYPE for #119 (timeline annotations). Not for merge.
 *
 * Annotations are read-only, time-based marks beside events: listening sessions, sleep, workouts,
 * focus sessions. They never enter the event overlap layout.
 *
 * Like the rest of the registry, this file is yours to edit. The default composition,
 * `TimeGridAnnotations`, draws Amie's look from small parts: `AnnotationRail`, `AnnotationMark`
 * (cva variants, Base UI `render`) and `AnnotationMarkIcon`. Restyle a part with `className` or a
 * `data-*` selector, recompose the parts in your own component and pass it as
 * `annotations.Annotations`, or change the parts here. The layout inputs that need numbers, the
 * rail's size and lanes, stay options because merging and lane packing depend on them.
 *
 * In the proposal, the types, `annotationMarks` and `layoutAnnotationMarks` live in calendar-core
 * (a separate snapshot, interval index and projection) and reach the view through its projection.
 */
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { useRender } from "@base-ui/react/use-render";
import { instantInterval, timedFragmentBox, type TimeGridColumn } from "@moltenship/calendar";
import { cva, type VariantProps } from "class-variance-authority";
import {
  createContext,
  use,
  useMemo,
  useState,
  type ComponentProps,
  type ComponentType,
  type CSSProperties,
} from "react";

import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import { PopoverContent } from "@registry/ui/popover";
import { TooltipContent } from "@registry/ui/tooltip";
import { cn } from "cn";

export interface TimeGridAnnotation {
  readonly id: string;
  readonly sourceId: string;
  readonly start: Temporal.Instant;
  readonly end: Temporal.Instant;
  readonly title: string;
  readonly detail?: string;
}

export interface TimeGridAnnotationSource {
  readonly id: string;
  readonly label: string;
  /** The app the data comes from, named in tooltips: "Spotify", "Apple Health". */
  readonly app: string;
  /** Sets `data-color` on the source's marks. */
  readonly color: CalendarEventColor;
  readonly Icon: ComponentType<{ readonly className?: string }>;
  /** Items closer than this merge into one mark, such as tracks into a listening session. */
  readonly mergeGapMinutes?: number;
}

/** The numbers the layout needs. The parts read them back as CSS variables. */
export interface TimeGridAnnotationRail {
  /** The column edge the rail sits on. */
  readonly side?: "start" | "end";
  /** Rail width in px: 18 in a multi-day grid and 30 in a single day by default. */
  readonly width?: number;
  /** Mark width in px: 12 and 20 by default. Marks merge and pack by their drawn size. */
  readonly markWidth?: number;
  /** `pack` shares the rail between overlapping marks; `per-source` gives each source a lane. */
  readonly layout?: "pack" | "per-source";
}

export interface TimeGridAnnotationsProps {
  /** The column's marks, merged and placed in the rail. */
  readonly marks: readonly TimeGridAnnotationMarkLayout[];
}

export interface TimeGridAnnotationOptions {
  readonly items: readonly TimeGridAnnotation[];
  readonly sources: readonly TimeGridAnnotationSource[];
  /** Marks open a details popover on click; without it they are hover-only. */
  readonly clickable?: boolean;
  /** `rail` reserves a strip beside events; `overlay` gives the parts the whole column, behind. */
  readonly placement?: "rail" | "overlay";
  readonly rail?: TimeGridAnnotationRail;
  /** Your composition of the parts, in place of `TimeGridAnnotations`. */
  readonly Annotations?: ComponentType<TimeGridAnnotationsProps>;
}

/** Items of one source merged into one mark, clipped to a column. */
export interface TimeGridAnnotationMark {
  readonly endsAfterDay: boolean;
  readonly items: readonly TimeGridAnnotation[];
  readonly key: string;
  readonly minutes: number;
  readonly source: TimeGridAnnotationSource;
  readonly startsBeforeDay: boolean;
  /** Fractions of the column's 24-hour axis, like event layouts. */
  readonly height: number;
  readonly top: number;
  readonly start: Temporal.Instant;
  readonly end: Temporal.Instant;
}

/** A mark placed in the rail, independent of the column's event lanes. */
export interface TimeGridAnnotationMarkLayout extends TimeGridAnnotationMark {
  /** `dot` when the mark is shorter than it is wide, so a capsule draws as a circle. */
  readonly kind: "bar" | "dot";
  readonly lane: number;
  readonly lanes: number;
  /** Px from the rail's start edge to the mark. */
  readonly offset: number;
  /** Width in px within its lane. */
  readonly width: number;
}

const MINUTE = 60_000_000_000n;
/** Gaps shorter than about 3px at the default hour height always merge (compaction). */
const MIN_GAP_MINUTES = 4;
/** The registry's default `--calendar-hour-height` (3rem); the real projection gets view geometry. */
const HOUR_PX = 48;
const COLUMN_PX = 24 * HOUR_PX;
const MAX_LANES = 3;

const later = (left: Temporal.Instant, right: Temporal.Instant) =>
  Temporal.Instant.compare(left, right) >= 0 ? left : right;
const earlier = (left: Temporal.Instant, right: Temporal.Instant) =>
  Temporal.Instant.compare(left, right) <= 0 ? left : right;
const larger = (left: bigint, right: bigint) => (left > right ? left : right);
const percent = (fraction: number) => `${fraction * 100}%`;

/**
 * Sessionizes each source and clips the result to one column. Items also merge when their marks
 * would touch: a mark is at least `markMinutes` tall, the time its circle covers. A linear scan
 * stands in for the annotation snapshot's interval index.
 */
export function annotationMarks(
  column: TimeGridColumn,
  { items, sources }: Pick<TimeGridAnnotationOptions, "items" | "sources">,
  { markMinutes = 0 }: { readonly markMinutes?: number } = {},
): readonly TimeGridAnnotationMark[] {
  const day = column.day.interval;
  if (day === null) return [];
  const marks: TimeGridAnnotationMark[] = [];
  const markLength = BigInt(Math.round(markMinutes * 60)) * 1_000_000_000n;

  for (const source of sources) {
    const gap = BigInt(Math.max(source.mergeGapMinutes ?? 0, MIN_GAP_MINUTES)) * MINUTE;
    const visible = items
      .filter(
        (item) =>
          item.sourceId === source.id &&
          Temporal.Instant.compare(item.start, day.end) < 0 &&
          Temporal.Instant.compare(item.end, day.start) > 0,
      )
      .toSorted((left, right) => Temporal.Instant.compare(left.start, right.start));
    const groups: {
      end: Temporal.Instant;
      items: TimeGridAnnotation[];
      start: Temporal.Instant;
    }[] = [];
    for (const item of visible) {
      const last = groups.at(-1);
      if (
        last !== undefined &&
        item.start.epochNanoseconds -
          larger(last.end.epochNanoseconds, last.start.epochNanoseconds + markLength) <=
          gap
      ) {
        last.items.push(item);
        last.end = later(last.end, item.end);
      } else {
        groups.push({ end: item.end, items: [item], start: item.start });
      }
    }
    for (const group of groups) {
      const from = later(group.start, day.start);
      const to = earlier(group.end, day.end);
      if (Temporal.Instant.compare(from, to) >= 0) continue;
      const box = timedFragmentBox(column, instantInterval(from, to));
      marks.push({
        end: group.end,
        endsAfterDay: Temporal.Instant.compare(group.end, day.end) > 0,
        height: box.height,
        items: group.items,
        key: `${source.id}:${group.items[0]!.id}`,
        minutes: Number((to.epochNanoseconds - from.epochNanoseconds) / MINUTE),
        source,
        start: group.start,
        startsBeforeDay: Temporal.Instant.compare(group.start, day.start) < 0,
        top: box.top,
      });
    }
  }
  return marks;
}

type ResolvedRail = Required<TimeGridAnnotationRail>;

function resolveRail(rail: TimeGridAnnotationRail | undefined, dense: boolean): ResolvedRail {
  return {
    layout: rail?.layout ?? "pack",
    markWidth: rail?.markWidth ?? (dense ? 12 : 20),
    side: rail?.side ?? "start",
    width: rail?.width ?? (dense ? 18 : 30),
  };
}

/**
 * Places marks in the rail: overlapping marks, counting a circle's full size, share it in up to
 * three lanes per collision group. Event lanes are never involved.
 */
export function layoutAnnotationMarks(
  marks: readonly TimeGridAnnotationMark[],
  sources: readonly TimeGridAnnotationSource[],
  rail: ResolvedRail,
): readonly TimeGridAnnotationMarkLayout[] {
  const markFraction = rail.markWidth / COLUMN_PX;
  const drawnEnd = (mark: TimeGridAnnotationMark) => mark.top + Math.max(mark.height, markFraction);
  const lanes = new Map<string, { lane: number; lanes: number }>();

  if (rail.layout === "per-source") {
    for (const mark of marks) {
      const lane = sources.findIndex((source) => source.id === mark.source.id);
      lanes.set(mark.key, { lane, lanes: sources.length });
    }
  } else {
    let group: TimeGridAnnotationMark[] = [];
    let groupEnd = -1;
    const flush = () => {
      const ends: number[] = [];
      const assigned = group.map((mark) => {
        let lane = ends.findIndex((end) => end <= mark.top);
        if (lane === -1) {
          lane = ends.length;
          ends.push(drawnEnd(mark));
        } else {
          ends[lane] = drawnEnd(mark);
        }
        return [mark.key, Math.min(lane, MAX_LANES - 1)] as const;
      });
      for (const [key, lane] of assigned) {
        lanes.set(key, { lane, lanes: Math.min(ends.length, MAX_LANES) });
      }
      group = [];
      groupEnd = -1;
    };
    for (const mark of marks.toSorted((left, right) => left.top - right.top)) {
      if (group.length > 0 && mark.top >= groupEnd) flush();
      group.push(mark);
      groupEnd = Math.max(groupEnd, drawnEnd(mark));
    }
    flush();
  }

  return marks.map((mark) => {
    const placed = lanes.get(mark.key)!;
    const laneWidth = (rail.width - 4) / placed.lanes;
    const width = Math.max(
      2,
      Math.min(rail.markWidth, Math.floor(laneWidth) - (placed.lanes > 1 ? 1 : 0)),
    );
    return {
      ...mark,
      kind: mark.height * COLUMN_PX < width ? "dot" : "bar",
      lane: placed.lane,
      lanes: placed.lanes,
      offset: 2 + placed.lane * laneWidth + (laneWidth - width) / 2,
      width,
    };
  });
}

export function useAnnotationHandles() {
  const [handles] = useState(() => ({
    popover: PopoverPrimitive.createHandle<TimeGridAnnotationMark>(),
    tooltip: TooltipPrimitive.createHandle<TimeGridAnnotationMark>(),
  }));
  return handles;
}

export type TimeGridAnnotationHandles = ReturnType<typeof useAnnotationHandles>;

interface AnnotationsContextValue {
  readonly clickable: boolean;
  readonly handles: TimeGridAnnotationHandles;
  readonly placement: "rail" | "overlay";
  readonly rail: ResolvedRail;
}

const AnnotationsContext = createContext<AnnotationsContextValue | null>(null);
const AnnotationMarkContext = createContext<TimeGridAnnotationMarkLayout | null>(null);

function useAnnotations(): AnnotationsContextValue {
  const context = use(AnnotationsContext);
  if (context === null) throw new Error("Annotation parts render inside a time grid column.");
  return context;
}

/** The mark an `AnnotationMark` renders, for parts inside it. */
export function useAnnotationMark(): TimeGridAnnotationMarkLayout {
  const mark = use(AnnotationMarkContext);
  if (mark === null) throw new Error("useAnnotationMark is for parts inside an AnnotationMark.");
  return mark;
}

/** The strip a column's marks sit in: beside events, or across the column for an overlay. */
export function AnnotationRail({ className, style, ...props }: ComponentProps<"div">) {
  const { placement, rail } = useAnnotations();
  return (
    <div
      aria-hidden
      data-slot="annotation-rail"
      data-placement={placement}
      data-side={rail.side}
      className={cn(
        "pointer-events-none absolute inset-y-0",
        placement === "overlay"
          ? "inset-x-0 z-0"
          : "z-[5] w-(--calendar-annotation-rail-width) data-[side=end]:end-0 data-[side=start]:start-0",
        className,
      )}
      style={{ "--calendar-annotation-rail-width": `${rail.width}px`, ...style } as CSSProperties}
      {...props}
    />
  );
}

/**
 * Mark geometry arrives as CSS variables: `--mark-top` and `--mark-height` (fractions of the day),
 * `--mark-offset` and `--mark-width` (px inside the rail).
 */
export const annotationMarkVariants = cva(
  "pointer-events-auto absolute top-(--mark-top) transition-[filter,background-color] duration-100 motion-reduce:transition-none",
  {
    variants: {
      variant: {
        /** Amie's look: a capsule never shorter than it is wide, so a short one is a circle. */
        capsule:
          "start-(--mark-offset) h-[max(var(--mark-width),calc(var(--mark-height)_-_1px))] w-(--mark-width) rounded-full bg-calendar-event-border shadow-[inset_0_0_0_1px_rgb(0_0_0/0.14)] hover:brightness-110 data-ends-after:rounded-b-none data-ends-after:mask-[linear-gradient(to_top,transparent,black_1.5rem)] data-starts-before:rounded-t-none data-starts-before:mask-[linear-gradient(to_bottom,transparent,black_1.5rem)] dark:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.16)]",
        /** A thin bar that keeps its true length. */
        bar: "start-(--mark-offset) h-[max(3px,calc(var(--mark-height)_-_1px))] w-(--mark-width) rounded-full bg-calendar-event-border hover:brightness-110 data-ends-after:rounded-b-none data-starts-before:rounded-t-none",
        /** A tint across the whole column behind events; for `placement: "overlay"`. */
        band: "inset-x-0 h-(--mark-height) border-s-2 border-calendar-event-border bg-calendar-event-border/12 hover:bg-calendar-event-border/24",
      },
    },
    defaultVariants: { variant: "capsule" },
  },
);

export interface AnnotationMarkProps
  extends useRender.ComponentProps<"div">, VariantProps<typeof annotationMarkVariants> {
  readonly mark: TimeGridAnnotationMarkLayout;
}

/**
 * One mark, wired to the grid's tooltip and, when clickable, its popover. Its children read the
 * mark through `useAnnotationMark`. `render` swaps the element, as everywhere in Base UI.
 */
export function AnnotationMark({
  className,
  mark,
  render,
  style,
  variant,
  ...props
}: AnnotationMarkProps) {
  const { clickable, handles } = useAnnotations();
  const element = useRender({
    defaultTagName: "div",
    props: {
      ...props,
      className: cn(annotationMarkVariants({ variant }), clickable && "cursor-pointer", className),
      "data-annotation-id": mark.items[0]!.id,
      "data-color": mark.source.color,
      "data-ends-after": mark.endsAfterDay ? "" : undefined,
      "data-kind": mark.kind,
      "data-slot": "annotation-mark",
      "data-source": mark.source.id,
      "data-starts-before": mark.startsBeforeDay ? "" : undefined,
      style: {
        "--mark-height": percent(mark.height),
        "--mark-offset": `${mark.offset}px`,
        "--mark-top": percent(mark.top),
        "--mark-width": `${mark.width}px`,
        ...style,
      } as CSSProperties,
    },
    render,
  });
  const tooltip = (
    <TooltipPrimitive.Trigger
      delay={0}
      handle={handles.tooltip}
      payload={mark}
      // The rail is aria-hidden; the day summary speaks for it. Keep marks out of the tab order.
      tabIndex={-1}
      render={element}
    />
  );

  return (
    <AnnotationMarkContext value={mark}>
      {clickable ? (
        <PopoverPrimitive.Trigger
          handle={handles.popover}
          nativeButton={false}
          payload={mark}
          tabIndex={-1}
          render={tooltip}
        />
      ) : (
        tooltip
      )}
    </AnnotationMarkContext>
  );
}

/**
 * The source's icon in a disc at the top of the mark. Children replace the icon, such as a brand
 * logo. It hides when the mark continues from the day before or is too narrow for it.
 */
export function AnnotationMarkIcon({ children, className, ...props }: ComponentProps<"span">) {
  const mark = useAnnotationMark();
  if (mark.startsBeforeDay || mark.width < 10) return null;
  const { Icon } = mark.source;
  return (
    <span
      data-slot="annotation-mark-icon"
      className={cn(
        "absolute inset-x-px top-px flex aspect-square items-center justify-center rounded-full bg-white/35 text-black/70 [&_svg]:size-[62%]",
        className,
      )}
      {...props}
    >
      {children ?? <Icon />}
    </span>
  );
}

/** The default composition: Amie's capsules with the source's icon inside the top. */
export function TimeGridAnnotations({ marks }: TimeGridAnnotationsProps) {
  return (
    <AnnotationRail>
      {marks.map((mark) => (
        <AnnotationMark key={mark.key} mark={mark}>
          <AnnotationMarkIcon />
        </AnnotationMark>
      ))}
    </AnnotationRail>
  );
}

/** Where the events sit inside a column, so a rail gets its own strip. */
export function annotationEventInset(
  options: TimeGridAnnotationOptions | undefined,
  dense: boolean,
): CSSProperties | undefined {
  if (options === undefined || options.placement === "overlay") return undefined;
  const rail = resolveRail(options.rail, dense);
  return rail.side === "start"
    ? { insetInlineStart: rail.width }
    : { insetInlineEnd: Math.max(8, rail.width + 2) };
}

function spokenMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours > 0 ? `${hours} h` : "", rest > 0 ? `${rest} min` : ""].filter(Boolean).join(" ");
}

/**
 * What a screen reader gets for a day, instead of a stop per mark: "Annotations: Sleep, until
 * 7:05 AM. Spotify, 3 sessions, 2 h 10 min."
 */
export function annotationSummary(
  marks: readonly TimeGridAnnotationMark[],
  formatTime: (instant: Temporal.Instant) => string,
): string {
  const parts: string[] = [];
  const bySource = Map.groupBy(marks, (mark) => mark.source);
  for (const [source, list] of bySource) {
    if (list.length === 1) {
      const [mark] = list;
      const when = mark!.startsBeforeDay
        ? `until ${formatTime(mark!.end)}`
        : mark!.endsAfterDay
          ? `from ${formatTime(mark!.start)}`
          : `${formatTime(mark!.start)} to ${formatTime(mark!.end)}`;
      parts.push(`${source.label}, ${when}`);
    } else {
      const total = list.reduce((sum, mark) => sum + mark.minutes, 0);
      parts.push(`${source.label}, ${list.length} sessions, ${spokenMinutes(total)}`);
    }
  }
  return parts.length === 0 ? "" : `Annotations: ${parts.join(". ")}.`;
}

export interface TimeGridAnnotationLayerProps {
  readonly column: TimeGridColumn;
  /** Whether the grid shows several days, which narrows the default rail. */
  readonly dense: boolean;
  readonly formatTime: (instant: Temporal.Instant) => string;
  readonly handles: TimeGridAnnotationHandles;
  readonly options: TimeGridAnnotationOptions;
}

/** One column's annotations: the day summary for screen readers and the composed parts. */
export function TimeGridAnnotationLayer({
  column,
  dense,
  formatTime,
  handles,
  options,
}: TimeGridAnnotationLayerProps) {
  const { items, placement = "rail", sources } = options;
  const { layout, markWidth, side, width } = resolveRail(options.rail, dense);
  const rail = useMemo(
    () => ({ layout, markWidth, side, width }),
    [layout, markWidth, side, width],
  );
  const markMinutes = placement === "overlay" ? 0 : (markWidth / HOUR_PX) * 60;
  const marks = useMemo(
    () => annotationMarks(column, { items, sources }, { markMinutes }),
    [column, items, markMinutes, sources],
  );
  const layouts = useMemo(
    () => layoutAnnotationMarks(marks, sources, rail),
    [marks, rail, sources],
  );
  const summary = useMemo(() => annotationSummary(marks, formatTime), [marks, formatTime]);
  const clickable = options.clickable === true;
  const context = useMemo(
    () => ({ clickable, handles, placement, rail }),
    [clickable, handles, placement, rail],
  );
  const Annotations = options.Annotations ?? TimeGridAnnotations;

  return (
    <>
      {summary !== "" && <span className="sr-only">{summary}</span>}
      <AnnotationsContext value={context}>
        <Annotations marks={layouts} />
      </AnnotationsContext>
    </>
  );
}

function timeRange(
  mark: TimeGridAnnotationMark,
  formatTime: (instant: Temporal.Instant) => string,
) {
  return `${formatTime(mark.start)} – ${formatTime(mark.end)}`;
}

function itemSummary(mark: TimeGridAnnotationMark): string {
  const [first] = mark.items;
  if (mark.items.length === 1) return [first!.title, first!.detail].filter(Boolean).join(" · ");
  return `${mark.items.length} items · ${first!.title}${first!.detail === undefined ? "" : ` — ${first!.detail}`}, …`;
}

/**
 * One tooltip and one popover for every mark in the grid, through Base UI's detached triggers, so
 * hundreds of marks do not mount hundreds of roots. The tooltip follows the pointer vertically.
 * Their content is yours to change here.
 */
export function TimeGridAnnotationOverlays({
  formatTime,
  handles,
}: {
  readonly formatTime: (instant: Temporal.Instant) => string;
  readonly handles: TimeGridAnnotationHandles;
}) {
  return (
    <>
      {/* Not hoverable: its hover bridge would sit under the pointer and swallow the click. */}
      <TooltipPrimitive.Root disableHoverablePopup handle={handles.tooltip} trackCursorAxis="y">
        {({ payload }) =>
          payload === undefined ? null : (
            <TooltipContent
              side="inline-end"
              sideOffset={8}
              className="flex-col items-start gap-0.5"
            >
              <span className="font-medium">
                {payload.source.label} · {timeRange(payload, formatTime)}
              </span>
              <span className="opacity-70">
                {payload.source.app} · {itemSummary(payload)}
              </span>
            </TooltipContent>
          )
        }
      </TooltipPrimitive.Root>
      <PopoverPrimitive.Root handle={handles.popover}>
        {({ payload }) =>
          payload === undefined ? null : (
            <PopoverContent side="inline-end" align="start" sideOffset={8} className="w-72">
              <div data-color={payload.source.color} className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-full bg-calendar-event-border text-background">
                  <payload.source.Icon className="size-4" />
                </span>
                <div className="min-w-0">
                  <PopoverPrimitive.Title className="text-sm leading-tight font-medium">
                    {payload.items.length === 1 ? payload.items[0]!.title : payload.source.label}
                  </PopoverPrimitive.Title>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {timeRange(payload, formatTime)}
                  </p>
                </div>
              </div>
              <ul className="flex flex-col gap-1 text-xs">
                {payload.items.slice(0, 5).map((item) => (
                  <li key={item.id} className="flex justify-between gap-3">
                    <span className="truncate">
                      {item.title}
                      {item.detail !== undefined && (
                        <span className="text-muted-foreground"> — {item.detail}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {formatTime(item.start)}
                    </span>
                  </li>
                ))}
                {payload.items.length > 5 && (
                  <li className="text-muted-foreground">and {payload.items.length - 5} more</li>
                )}
              </ul>
              <p className="border-t pt-2 text-[0.6875rem] text-muted-foreground">
                Read-only · from {payload.source.app}
              </p>
            </PopoverContent>
          )
        }
      </PopoverPrimitive.Root>
    </>
  );
}
