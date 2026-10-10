/**
 * PROTOTYPE for #119 (timeline annotations). Not for merge.
 *
 * Annotations are read-only, time-based marks beside events: listening sessions, sleep, workouts,
 * focus sessions. They never enter the event overlap layout. In the proposal, the types and
 * `annotationMarks` live in calendar-core (a separate snapshot, interval index and projection);
 * here they sit next to the time grid so the demo can try the visual variants.
 */
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { instantInterval, timedFragmentBox, type TimeGridColumn } from "@moltenship/calendar";
import { useMemo, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";

import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import { PopoverContent } from "@registry/ui/popover";
import { TooltipContent } from "@registry/ui/tooltip";
import { cn } from "cn";

export type TimeGridAnnotationVariant = "edge" | "rail" | "band" | "lanes";

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
}

export interface TimeGridAnnotationOptions {
  readonly items: readonly TimeGridAnnotation[];
  readonly sources: readonly TimeGridAnnotationSource[];
  readonly variant: TimeGridAnnotationVariant;
  /** Marks open a details popover on click; without it they are hover-only. */
  readonly clickable?: boolean;
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

const MINUTE = 60_000_000_000n;
/** Gaps shorter than about 3px at the default hour height always merge (compaction). */
const MIN_GAP_MINUTES = 4;
/** Below this, a rail shows a badge at the start instead of a bar. */
const RAIL_BAR_MINUTES = 22;
const RAIL_WIDTH = 18;
const BADGE = 14;

const later = (left: Temporal.Instant, right: Temporal.Instant) =>
  Temporal.Instant.compare(left, right) >= 0 ? left : right;
const earlier = (left: Temporal.Instant, right: Temporal.Instant) =>
  Temporal.Instant.compare(left, right) <= 0 ? left : right;

/**
 * Sessionizes each source and clips the result to one column. A linear scan stands in for the
 * annotation snapshot's interval index.
 */
export function annotationMarks(
  column: TimeGridColumn,
  { items, sources }: Pick<TimeGridAnnotationOptions, "items" | "sources">,
): readonly TimeGridAnnotationMark[] {
  const day = column.day.interval;
  if (day === null) return [];
  const marks: TimeGridAnnotationMark[] = [];

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
      if (last !== undefined && item.start.epochNanoseconds - last.end.epochNanoseconds <= gap) {
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

/** Packs overlapping marks into at most `max` sub-lanes of the gutter, never into event lanes. */
function gutterLanes(marks: readonly TimeGridAnnotationMark[], max: number) {
  const ends: number[] = [];
  const lanes = new Map<string, number>();
  for (const mark of marks.toSorted((left, right) => left.top - right.top)) {
    let lane = ends.findIndex((end) => end <= mark.top);
    if (lane === -1) {
      lane = ends.length;
      ends.push(mark.top + mark.height);
    } else {
      ends[lane] = mark.top + mark.height;
    }
    lanes.set(mark.key, Math.min(lane, max - 1));
  }
  return { count: Math.min(ends.length, max), lanes };
}

/** Where the events sit inside a column, so annotations get their own strip. */
export function annotationEventInset(
  options: TimeGridAnnotationOptions | undefined,
): CSSProperties | undefined {
  switch (options?.variant) {
    case undefined:
    case "band":
      return undefined;
    case "edge":
      return { insetInlineStart: 10 };
    case "rail":
      return { insetInlineStart: RAIL_WIDTH };
    case "lanes":
      return { insetInlineEnd: 8 + options.sources.length * 3 };
  }
}

export function useAnnotationHandles() {
  const [handles] = useState(() => ({
    popover: PopoverPrimitive.createHandle<TimeGridAnnotationMark>(),
    tooltip: TooltipPrimitive.createHandle<TimeGridAnnotationMark>(),
  }));
  return handles;
}

export type TimeGridAnnotationHandles = ReturnType<typeof useAnnotationHandles>;

const percent = (fraction: number) => `${fraction * 100}%`;

function Mark({
  className,
  clickable,
  handles,
  mark,
  style,
  children,
}: {
  readonly className: string;
  readonly clickable: boolean;
  readonly handles: TimeGridAnnotationHandles;
  readonly mark: TimeGridAnnotationMark;
  readonly style: CSSProperties;
  readonly children?: ReactNode;
}) {
  const base = (
    <div
      data-slot="time-grid-annotation"
      data-color={mark.source.color}
      className={cn("pointer-events-auto absolute", clickable && "cursor-pointer", className)}
      style={style}
    />
  );
  const tooltip = (
    <TooltipPrimitive.Trigger
      delay={0}
      handle={handles.tooltip}
      payload={mark}
      // The layer is aria-hidden; the day summary speaks for it. Keep marks out of the tab order.
      tabIndex={-1}
      render={base}
    >
      {children}
    </TooltipPrimitive.Trigger>
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

function EdgeMarks({ marks, ...shared }: LayerProps) {
  const { count, lanes } = gutterLanes(marks, 2);
  return marks.map((mark) => {
    const lane = lanes.get(mark.key) ?? 0;
    return (
      <Mark
        key={mark.key}
        mark={mark}
        {...shared}
        className={cn(
          "rounded-full bg-calendar-event-border transition-transform duration-100 hover:scale-x-150 motion-reduce:transition-none motion-reduce:hover:scale-x-100",
          mark.startsBeforeDay && "rounded-t-none",
          mark.endsAfterDay && "rounded-b-none",
        )}
        style={{
          height: `max(3px, calc(${percent(mark.height)} - 1px))`,
          insetInlineStart: count > 1 ? 2 + lane * 4 : 3,
          top: percent(mark.top),
          width: count > 1 ? 3 : 4,
        }}
      />
    );
  });
}

function RailMarks({ marks, ...shared }: LayerProps) {
  const bars = marks.filter((mark) => mark.minutes >= RAIL_BAR_MINUTES);
  const { count, lanes } = gutterLanes(bars, 3);
  const width = count === 1 ? 6 : count === 2 ? 5 : 4;
  const total = count * width + (count - 1) * 2;
  // Badges that would overlap cluster into one, led by the earliest.
  const badges: TimeGridAnnotationMark[][] = [];
  for (const mark of marks
    .filter((mark) => mark.minutes < RAIL_BAR_MINUTES)
    .toSorted((left, right) => left.top - right.top)) {
    const last = badges.at(-1);
    if (last !== undefined && (mark.top - last[0]!.top) * 24 * 48 < BADGE + 2) last.push(mark);
    else badges.push([mark]);
  }

  return (
    <>
      <div
        aria-hidden
        className="absolute inset-y-0 start-0 bg-muted/50 dark:bg-muted/30"
        style={{ width: RAIL_WIDTH }}
      />
      {bars.map((mark) => (
        <Mark
          key={mark.key}
          mark={mark}
          {...shared}
          className={cn(
            "rounded-full bg-calendar-event-border hover:ring-2 hover:ring-calendar-event-border hover:ring-offset-2 hover:ring-offset-background",
            mark.startsBeforeDay &&
              "rounded-t-none mask-[linear-gradient(to_bottom,transparent,black_1.75rem)]",
            mark.endsAfterDay &&
              "rounded-b-none mask-[linear-gradient(to_top,transparent,black_1.75rem)]",
          )}
          style={{
            height: `calc(${percent(mark.height)} - 1px)`,
            insetInlineStart: (RAIL_WIDTH - total) / 2 + (lanes.get(mark.key) ?? 0) * (width + 2),
            top: percent(mark.top),
            width,
          }}
        />
      ))}
      {badges.map((cluster) => {
        const lead = cluster[0]!;
        const { Icon } = lead.source;
        return (
          <Mark
            key={lead.key}
            mark={
              cluster.length === 1
                ? lead
                : { ...lead, items: cluster.flatMap((mark) => mark.items) }
            }
            {...shared}
            className="flex items-center justify-center rounded-full bg-background text-calendar-event-border ring-[1.5px] ring-calendar-event-border ring-inset transition-transform duration-100 hover:scale-110 motion-reduce:transition-none motion-reduce:hover:scale-100"
            style={{
              height: BADGE,
              insetInlineStart: (RAIL_WIDTH - BADGE) / 2,
              top: `calc(${percent(lead.top)} - 4px)`,
              width: BADGE,
            }}
          >
            <Icon className="size-2.5" />
            {cluster.length > 1 && (
              <span className="absolute -end-1.5 -top-1.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-foreground px-0.5 text-[0.5rem] leading-none font-semibold text-background tabular-nums">
                {cluster.length}
              </span>
            )}
          </Mark>
        );
      })}
    </>
  );
}

function BandMarks({ marks, ...shared }: LayerProps) {
  return marks.map((mark) => {
    const { Icon } = mark.source;
    return (
      <Mark
        key={mark.key}
        mark={mark}
        {...shared}
        className="border-s-2 border-calendar-event-border bg-calendar-event-border/12 hover:bg-calendar-event-border/24"
        style={{ height: percent(mark.height), insetInline: 0, top: percent(mark.top) }}
      >
        {mark.minutes >= 30 && mark.source.mergeGapMinutes === undefined && (
          <span className="absolute start-1 top-0.5 flex max-w-[calc(100%-0.5rem)] items-center gap-1 truncate text-[0.625rem] font-semibold text-calendar-event-foreground">
            <Icon className="size-2.5 shrink-0" />
            {mark.items[0]!.title}
          </span>
        )}
      </Mark>
    );
  });
}

function LaneMarks({
  marks,
  sources,
  ...shared
}: LayerProps & { readonly sources: readonly TimeGridAnnotationSource[] }) {
  return marks.map((mark) => (
    <Mark
      key={mark.key}
      mark={mark}
      {...shared}
      className="rounded-[1px] bg-calendar-event-border transition-transform duration-100 hover:scale-x-[1.8] motion-reduce:transition-none motion-reduce:hover:scale-x-100"
      style={{
        height: `max(2px, calc(${percent(mark.height)} - 1px))`,
        insetInlineEnd: 2 + sources.findIndex((source) => source.id === mark.source.id) * 3,
        top: percent(mark.top),
        width: 2,
      }}
    />
  ));
}

interface LayerProps {
  readonly clickable: boolean;
  readonly handles: TimeGridAnnotationHandles;
  readonly marks: readonly TimeGridAnnotationMark[];
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
  readonly formatTime: (instant: Temporal.Instant) => string;
  readonly handles: TimeGridAnnotationHandles;
  readonly options: TimeGridAnnotationOptions;
}

/** One column's marks, behind events for the band variant and beside them otherwise. */
export function TimeGridAnnotationLayer({
  column,
  formatTime,
  handles,
  options,
}: TimeGridAnnotationLayerProps) {
  const { items, sources, variant } = options;
  const marks = useMemo(
    () => annotationMarks(column, { items, sources }),
    [column, items, sources],
  );
  const summary = useMemo(() => annotationSummary(marks, formatTime), [marks, formatTime]);
  const shared = { clickable: options.clickable === true, handles, marks };

  return (
    <>
      {summary !== "" && <span className="sr-only">{summary}</span>}
      <div
        aria-hidden
        data-slot="time-grid-annotations"
        data-variant={variant}
        className={cn("pointer-events-none absolute inset-0", variant === "band" ? "z-0" : "z-[5]")}
      >
        {variant === "edge" && <EdgeMarks {...shared} />}
        {variant === "rail" && <RailMarks {...shared} />}
        {variant === "band" && <BandMarks {...shared} />}
        {variant === "lanes" && <LaneMarks {...shared} sources={sources} />}
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
