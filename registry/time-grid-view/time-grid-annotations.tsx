/**
 * PROTOTYPE for #119 (timeline annotations). Not for merge.
 *
 * Annotations are read-only, time-based marks beside events: listening sessions, sleep, workouts,
 * focus sessions. They never enter the event overlap layout. By default they draw in a rail at the
 * start of each day column, as capsules with the source's icon inside the top (Amie's look); a
 * `renderMark` and the rail options replace any part of that. In the proposal, the types,
 * `annotationMarks` and `layoutAnnotationMarks` live in calendar-core (a separate snapshot,
 * interval index and projection); here they sit next to the time grid so the demo can try them.
 */
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { instantInterval, timedFragmentBox, type TimeGridColumn } from "@moltenship/calendar";
import {
  useMemo,
  useState,
  type ComponentType,
  type CSSProperties,
  type ReactElement,
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
  readonly color: CalendarEventColor;
  readonly Icon: ComponentType<{ readonly className?: string }>;
  /** Items closer than this merge into one mark, such as tracks into a listening session. */
  readonly mergeGapMinutes?: number;
  /** Extra classes for this source's marks, such as a texture for sleep. */
  readonly markClassName?: string;
}

export interface TimeGridAnnotationRail {
  /** The column edge the rail sits on. */
  readonly side?: "start" | "end";
  /** Rail width in px: 18 in a multi-day grid and 30 in a single day by default. */
  readonly width?: number;
  /** Mark width in px: 12 and 20 by default. A mark shorter than it is wide draws as a circle. */
  readonly markWidth?: number;
  /** `pack` shares the rail between overlapping marks; `per-source` gives each source a lane. */
  readonly layout?: "pack" | "per-source";
}

export interface TimeGridAnnotationOptions {
  readonly items: readonly TimeGridAnnotation[];
  readonly sources: readonly TimeGridAnnotationSource[];
  /** Marks open a details popover on click; without it they are hover-only. */
  readonly clickable?: boolean;
  /** `rail` reserves a strip beside events; `overlay` draws full width behind them. */
  readonly placement?: "rail" | "overlay";
  readonly rail?: TimeGridAnnotationRail;
  /** Replaces the default capsule. Spread `props` on the element: they place it and wire hover. */
  readonly renderMark?: TimeGridAnnotationRenderer;
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
  /** `dot` when the mark is shorter than it is wide, so it draws as a circle. */
  readonly kind: "bar" | "dot";
  readonly lane: number;
  readonly lanes: number;
  /** Width in px within its lane; 0 when drawn as an overlay. */
  readonly width: number;
}

export interface TimeGridAnnotationMarkProps {
  readonly className: string;
  readonly style: CSSProperties;
  readonly "data-color": CalendarEventColor;
  readonly "data-continues"?: "start" | "end" | "both";
  readonly "data-kind": "bar" | "dot";
  readonly "data-slot": "time-grid-annotation";
  readonly "data-source": string;
}

export type TimeGridAnnotationRenderer = (
  mark: TimeGridAnnotationMarkLayout,
  props: TimeGridAnnotationMarkProps,
) => ReactElement;

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

function resolveRail(options: TimeGridAnnotationOptions, dense: boolean): ResolvedRail {
  return {
    layout: options.rail?.layout ?? "pack",
    markWidth: options.rail?.markWidth ?? (dense ? 12 : 20),
    side: options.rail?.side ?? "start",
    width: options.rail?.width ?? (dense ? 18 : 30),
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
      width,
    };
  });
}

const percent = (fraction: number) => `${fraction * 100}%`;

function markProps(
  mark: TimeGridAnnotationMarkLayout,
  rail: ResolvedRail,
  overlay: boolean,
  clickable: boolean,
): TimeGridAnnotationMarkProps {
  const shared = {
    className: cn("pointer-events-auto absolute", clickable && "cursor-pointer"),
    "data-color": mark.source.color,
    "data-continues": mark.startsBeforeDay
      ? mark.endsAfterDay
        ? ("both" as const)
        : ("start" as const)
      : mark.endsAfterDay
        ? ("end" as const)
        : undefined,
    "data-kind": mark.kind,
    "data-slot": "time-grid-annotation" as const,
    "data-source": mark.source.id,
  };
  if (overlay) {
    return {
      ...shared,
      style: { height: percent(mark.height), insetInline: 0, top: percent(mark.top) },
    };
  }
  const laneWidth = (rail.width - 4) / mark.lanes;
  const offset = 2 + mark.lane * laneWidth + (laneWidth - mark.width) / 2;
  return {
    ...shared,
    style: {
      // A mark is never shorter than it is wide, so a short one is a circle.
      height: `max(${mark.width}px, calc(${percent(mark.height)} - 1px))`,
      [rail.side === "start" ? "insetInlineStart" : "insetInlineEnd"]: offset,
      top: percent(mark.top),
      width: mark.width,
    },
  };
}

/**
 * The default mark: a capsule in the source's colour with its icon inside the top, or a circle with
 * the icon when short. A part cut off by the day boundary fades out and drops the icon.
 */
export const renderRailMark: TimeGridAnnotationRenderer = (mark, props) => {
  const { Icon } = mark.source;
  return (
    <div
      {...props}
      className={cn(
        props.className,
        "rounded-full bg-calendar-event-border shadow-[inset_0_0_0_1px_rgb(0_0_0/0.14)] transition-[filter] duration-100 hover:brightness-110 motion-reduce:transition-none dark:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.16)]",
        mark.startsBeforeDay &&
          "rounded-t-none mask-[linear-gradient(to_bottom,transparent,black_1.5rem)]",
        mark.endsAfterDay &&
          "rounded-b-none mask-[linear-gradient(to_top,transparent,black_1.5rem)]",
        mark.source.markClassName,
      )}
    >
      {!mark.startsBeforeDay && mark.width >= 10 && (
        <span
          data-slot="time-grid-annotation-icon"
          className="absolute inset-x-px top-px flex aspect-square items-center justify-center rounded-full bg-white/35 text-black/70"
        >
          <Icon className="size-[62%]" />
        </span>
      )}
    </div>
  );
};

export function useAnnotationHandles() {
  const [handles] = useState(() => ({
    popover: PopoverPrimitive.createHandle<TimeGridAnnotationMark>(),
    tooltip: TooltipPrimitive.createHandle<TimeGridAnnotationMark>(),
  }));
  return handles;
}

export type TimeGridAnnotationHandles = ReturnType<typeof useAnnotationHandles>;

/** Wires a rendered mark to the grid's one tooltip and, when clickable, its one popover. */
function Mark({
  clickable,
  element,
  handles,
  mark,
}: {
  readonly clickable: boolean;
  readonly element: ReactElement;
  readonly handles: TimeGridAnnotationHandles;
  readonly mark: TimeGridAnnotationMarkLayout;
}) {
  const tooltip = (
    <TooltipPrimitive.Trigger
      delay={0}
      handle={handles.tooltip}
      payload={mark}
      // The layer is aria-hidden; the day summary speaks for it. Keep marks out of the tab order.
      tabIndex={-1}
      render={element}
    />
  );
  return clickable ? (
    <PopoverPrimitive.Trigger
      handle={handles.popover}
      nativeButton={false}
      payload={mark}
      tabIndex={-1}
      render={tooltip}
    />
  ) : (
    tooltip
  );
}

/** Where the events sit inside a column, so a rail gets its own strip. */
export function annotationEventInset(
  options: TimeGridAnnotationOptions | undefined,
  dense: boolean,
): CSSProperties | undefined {
  if (options === undefined || options.placement === "overlay") return undefined;
  const rail = resolveRail(options, dense);
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

/** One column's marks: in the rail beside events, or behind them as an overlay. */
export function TimeGridAnnotationLayer({
  column,
  dense,
  formatTime,
  handles,
  options,
}: TimeGridAnnotationLayerProps) {
  const { items, placement = "rail", sources } = options;
  const overlay = placement === "overlay";
  const rail = resolveRail(options, dense);
  const markMinutes = overlay ? 0 : (rail.markWidth / HOUR_PX) * 60;
  const marks = useMemo(
    () => annotationMarks(column, { items, sources }, { markMinutes }),
    [column, items, markMinutes, sources],
  );
  const { layout, markWidth, side, width } = rail;
  const layouts = useMemo(
    () => layoutAnnotationMarks(marks, sources, { layout, markWidth, side, width }),
    [layout, markWidth, marks, side, sources, width],
  );
  const summary = useMemo(() => annotationSummary(marks, formatTime), [marks, formatTime]);
  const render = options.renderMark ?? renderRailMark;
  const clickable = options.clickable === true;

  return (
    <>
      {summary !== "" && <span className="sr-only">{summary}</span>}
      <div
        aria-hidden
        data-slot="time-grid-annotations"
        data-placement={placement}
        className={cn("pointer-events-none absolute inset-0", overlay ? "z-0" : "z-[5]")}
      >
        {layouts.map((mark) => (
          <Mark
            key={mark.key}
            clickable={clickable}
            element={render(mark, markProps(mark, rail, overlay, clickable))}
            handles={handles}
            mark={mark}
          />
        ))}
      </div>
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
