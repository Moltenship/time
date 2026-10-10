import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { useRender } from "@base-ui/react/use-render";
import {
  useCalendarAnnotations,
  useTimeGridAnnotations,
  type CalendarAnnotationSource,
  type TimeGridAnnotationMark,
  type TimeGridColumn,
} from "@moltenship/calendar";
import { cva, type VariantProps } from "class-variance-authority";
import { XIcon } from "lucide-react";
import {
  createContext,
  use,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ComponentType,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";

import {
  calendarEventColors,
  type CalendarEventColor,
} from "@registry/calendar-theme/event-colors";
import { Button } from "@registry/ui/button";
import { PopoverContent } from "@registry/ui/popover";
import { TooltipContent } from "@registry/ui/tooltip";
import { cn } from "cn";

import { annotationRange, type AnnotationFormats } from "./annotation-label";

/** A source with how the time grid draws it. */
export interface TimeGridAnnotationSource extends CalendarAnnotationSource {
  /** Sets `data-color` on its marks; without it they use the theme's default event colour. */
  readonly color?: CalendarEventColor;
  /** Drawn inside the top of its marks. */
  readonly Icon?: ComponentType<{ readonly className?: string }>;
}

export type TimeGridAnnotationMarkData = TimeGridAnnotationMark;

type AnnotationIcon = ComponentType<{ readonly className?: string }>;

/**
 * A source's `color` and `Icon`, when they are valid. Sources reach the view through the root as
 * plain `CalendarAnnotationSource`s, so the fields are checked rather than assumed.
 */
export function annotationSourceStyle(source: CalendarAnnotationSource): {
  readonly color?: CalendarEventColor;
  readonly Icon?: AnnotationIcon;
} {
  const { color, Icon } = source as { readonly color?: unknown; readonly Icon?: unknown };
  return {
    color: calendarEventColors.find((known) => known === color),
    // Function components, and memo or forwardRef objects.
    Icon:
      typeof Icon === "function" || (typeof Icon === "object" && Icon !== null)
        ? (Icon as AnnotationIcon)
        : undefined,
  };
}

/** The rail's size and lanes, in px. The layout needs them as numbers to merge and pack marks. */
export interface TimeGridAnnotationRail {
  /** The column edge the rail sits on. */
  readonly side?: "start" | "end";
  /** 18 in a multi-day grid and 30 in a single day by default. */
  readonly width?: number;
  /** 12 and 20 by default. A mark is never shorter than it is wide, so a short one is a circle. */
  readonly markWidth?: number;
  /** `pack` shares the rail between overlapping marks; `per-source` gives each source a lane. */
  readonly layout?: "pack" | "per-source";
}

export interface TimeGridAnnotationsProps {
  /** One column's marks, merged and placed in lanes. */
  readonly marks: readonly TimeGridAnnotationMarkData[];
}

export interface TimeGridAnnotationOptions {
  /** `rail` reserves a strip beside events; `overlay` gives the parts the whole column, behind. */
  readonly placement?: "rail" | "overlay";
  readonly rail?: TimeGridAnnotationRail;
  /** Your composition of the parts below, in place of `TimeGridAnnotations`. */
  readonly Annotations?: ComponentType<TimeGridAnnotationsProps>;
}

type ResolvedRail = Required<TimeGridAnnotationRail>;

/** The layout a time grid hands its columns and header. */
export interface TimeGridAnnotationLayout {
  /** Marks per column; empty when the root has no annotation sources. */
  readonly columns: readonly (readonly TimeGridAnnotationMarkData[])[];
  readonly enabled: boolean;
  readonly options: TimeGridAnnotationOptions;
  readonly placement: "rail" | "overlay";
  readonly rail: ResolvedRail;
}

/** What a grid hands its header and columns when the root has annotation sources. */
export interface TimeGridAnnotationWiring {
  readonly formats: AnnotationFormats;
  readonly handles: TimeGridAnnotationHandles;
  readonly layout: TimeGridAnnotationLayout;
}

/** The registry's default `--calendar-hour-height` (3rem) over a day, until the grid is measured. */
export const DEFAULT_COLUMN_HEIGHT = 24 * 48;
/** Marks of one source closer than this many px merge, so they never touch. */
const MIN_GAP_PX = 3;
/** Space between the rail's edges and its lanes. */
const RAIL_PADDING = 2;
/** Narrower marks drop their icon. */
const MIN_ICON_WIDTH = 10;

function resolveRail(rail: TimeGridAnnotationRail | undefined, dense: boolean): ResolvedRail {
  return {
    layout: rail?.layout ?? "pack",
    markWidth: rail?.markWidth ?? (dense ? 12 : 20),
    side: rail?.side ?? "start",
    width: rail?.width ?? (dense ? 18 : 30),
  };
}

/**
 * Lays the root's annotations out for a grid's columns. Merging and lane packing use the drawn
 * size, so they need the column's height in px.
 */
export function useTimeGridAnnotationLayout(
  columns: readonly TimeGridColumn[],
  options: TimeGridAnnotationOptions = {},
  { columnHeight, dense }: { readonly columnHeight: number; readonly dense: boolean },
): TimeGridAnnotationLayout {
  const { sources } = useCalendarAnnotations();
  const placement = options.placement ?? "rail";
  const { layout, markWidth, side, width } = resolveRail(options.rail, dense);
  const overlay = placement === "overlay";
  const marks = useTimeGridAnnotations(columns, {
    layout,
    minGap: overlay ? 0 : MIN_GAP_PX / columnHeight,
    minHeight: overlay ? 0 : markWidth / columnHeight,
  });
  return useMemo(
    () => ({
      columns: marks,
      enabled: sources.length > 0,
      options,
      placement,
      rail: { layout, markWidth, side, width },
    }),
    [layout, markWidth, marks, options, placement, side, sources.length, width],
  );
}

/** Where a column's events sit, so a rail gets its own strip. */
export function annotationEventInset(layout: TimeGridAnnotationLayout): CSSProperties | undefined {
  if (!layout.enabled || layout.placement === "overlay") return undefined;
  return layout.rail.side === "start"
    ? { insetInlineStart: layout.rail.width }
    : { insetInlineEnd: Math.max(8, layout.rail.width + 2) };
}

export function useAnnotationHandles() {
  const [handles] = useState(() => ({
    popover: PopoverPrimitive.createHandle<TimeGridAnnotationMarkData>(),
    tooltip: TooltipPrimitive.createHandle<TimeGridAnnotationMarkData>(),
  }));
  return handles;
}

export type TimeGridAnnotationHandles = ReturnType<typeof useAnnotationHandles>;

interface AnnotationsContextValue {
  readonly handles: TimeGridAnnotationHandles;
  readonly placement: "rail" | "overlay";
  readonly rail: ResolvedRail;
}

interface AnnotationMarkContextValue {
  readonly mark: TimeGridAnnotationMarkData;
  /** The mark's width in px within its lane. */
  readonly width: number;
}

const AnnotationsContext = createContext<AnnotationsContextValue | null>(null);
const AnnotationMarkContext = createContext<AnnotationMarkContextValue | null>(null);

function useAnnotationsContext(): AnnotationsContextValue {
  const context = use(AnnotationsContext);
  if (context === null) throw new Error("Annotation parts render inside a time grid column.");
  return context;
}

/** The mark an `AnnotationMark` renders and its width, for parts inside it. */
export function useAnnotationMark(): AnnotationMarkContextValue {
  const context = use(AnnotationMarkContext);
  if (context === null) throw new Error("useAnnotationMark is for parts inside an AnnotationMark.");
  return context;
}

/** Provides one column's annotation context to the parts; the column renders it. */
export function TimeGridAnnotationProvider({
  children,
  handles,
  layout,
}: {
  readonly children: ReactNode;
  readonly handles: TimeGridAnnotationHandles;
  readonly layout: TimeGridAnnotationLayout;
}) {
  const { placement, rail } = layout;
  const value = useMemo(() => ({ handles, placement, rail }), [handles, placement, rail]);
  return <AnnotationsContext value={value}>{children}</AnnotationsContext>;
}

/** The strip a column's marks sit in: beside events, or across the column for an overlay. */
export function AnnotationRail({ className, style, ...props }: ComponentProps<"div">) {
  const { placement, rail } = useAnnotationsContext();
  return (
    <div
      // The day's summary and each slot's name speak for the marks.
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
 * Geometry arrives as CSS variables: `--mark-top` and `--mark-height` as fractions of the day,
 * `--mark-offset` and `--mark-width` in px inside the rail. A variant's `--mark-min-height` keeps
 * a short mark near midnight inside the day, drawn up from its end as the layout measures it.
 */
export const annotationMarkVariants = cva(
  "pointer-events-auto absolute top-[min(var(--mark-top),calc(100%_-_var(--mark-min-height,0px)))] transition-[filter,background-color] duration-100 motion-reduce:transition-none",
  {
    variants: {
      variant: {
        /** A capsule never shorter than it is wide, so a short one is a circle. */
        capsule:
          "start-(--mark-offset) h-[max(var(--mark-min-height),calc(var(--mark-height)_-_1px))] w-(--mark-width) rounded-full [--mark-min-height:var(--mark-width)] bg-calendar-event-border shadow-[inset_0_0_0_1px_rgb(0_0_0/0.14)] hover:brightness-110 data-ends-after:rounded-b-none data-ends-after:mask-[linear-gradient(to_top,transparent,black_1.5rem)] data-starts-before:rounded-t-none data-starts-before:mask-[linear-gradient(to_bottom,transparent,black_1.5rem)] data-starts-before:data-ends-after:mask-[linear-gradient(to_bottom,transparent,black_1.5rem,black_calc(100%-1.5rem),transparent)] dark:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.16)]",
        /** A thin bar that keeps its true length. */
        bar: "start-(--mark-offset) h-[max(var(--mark-min-height),calc(var(--mark-height)_-_1px))] w-(--mark-width) rounded-full [--mark-min-height:3px] bg-calendar-event-border hover:brightness-110 data-ends-after:rounded-b-none data-starts-before:rounded-t-none",
        /** A tint across the column behind events; for `placement: "overlay"`. */
        band: "inset-x-0 h-(--mark-height) border-s-2 border-calendar-event-border bg-calendar-event-border/12 hover:bg-calendar-event-border/24",
      },
    },
    defaultVariants: { variant: "capsule" },
  },
);

export interface AnnotationMarkProps
  extends useRender.ComponentProps<"div">, VariantProps<typeof annotationMarkVariants> {
  readonly mark: TimeGridAnnotationMarkData;
  /** Opens the details popover on click. */
  readonly details?: boolean;
}

/**
 * One mark, wired to the grid's tooltip and details popover. Children read it through
 * `useAnnotationMark`; `render` swaps the element, as everywhere in Base UI.
 */
export function AnnotationMark({
  className,
  mark,
  details = true,
  onMouseDown,
  render,
  style,
  variant,
  ...props
}: AnnotationMarkProps) {
  const { handles, rail } = useAnnotationsContext();
  const laneWidth = (rail.width - RAIL_PADDING * 2) / mark.lanes;
  const width = Math.max(
    2,
    Math.min(rail.markWidth, Math.floor(laneWidth) - (mark.lanes > 1 ? 1 : 0)),
  );
  const offset = RAIL_PADDING + mark.lane * laneWidth + (laneWidth - width) / 2;
  const context = useMemo(() => ({ mark, width }), [mark, width]);
  const element = useRender({
    defaultTagName: "div",
    props: {
      ...props,
      className: cn(annotationMarkVariants({ variant }), details && "cursor-pointer", className),
      "data-annotation-id": String(mark.annotations[0]!.id),
      // Pressing a mark never starts a drag in the grid.
      "data-calendar-pointer": "none",
      "data-color": annotationSourceStyle(mark.source).color,
      "data-ends-after": mark.endsAfterDay ? "" : undefined,
      "data-kind": mark.kind,
      "data-slot": "annotation-mark",
      "data-source": mark.source.id,
      "data-starts-before": mark.startsBeforeDay ? "" : undefined,
      // A click opens the details without focusing the mark, which sits in the aria-hidden rail.
      onMouseDown: (event: MouseEvent<HTMLDivElement>) => {
        onMouseDown?.(event);
        event.preventDefault();
      },
      style: {
        "--mark-height": `${mark.height * 100}%`,
        "--mark-offset": `${offset}px`,
        "--mark-top": `${mark.top * 100}%`,
        "--mark-width": `${width}px`,
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
      // Out of the tab order: the rail is aria-hidden.
      tabIndex={-1}
      render={element}
    />
  );

  return (
    <AnnotationMarkContext value={context}>
      {details ? (
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
 * The source's icon in a disc at the top of the mark. Children replace it, such as a brand logo.
 * It hides when the mark continues from the day before or is too narrow.
 */
export function AnnotationMarkIcon({ children, className, ...props }: ComponentProps<"span">) {
  const { mark, width } = useAnnotationMark();
  const { Icon } = annotationSourceStyle(mark.source);
  const icon = children ?? (Icon === undefined ? null : <Icon />);
  if (icon === null || mark.startsBeforeDay || width < MIN_ICON_WIDTH) return null;
  return (
    <span
      data-slot="annotation-mark-icon"
      className={cn(
        "absolute inset-x-px top-px flex aspect-square items-center justify-center rounded-full bg-white/35 text-black/70 [&_svg]:size-[62%]",
        className,
      )}
      {...props}
    >
      {icon}
    </span>
  );
}

/** The default composition: capsules in the source's colour with its icon inside the top. */
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

/**
 * One tooltip and one popover for every mark in the grid, through Base UI's detached triggers, so
 * hundreds of marks never mount hundreds of roots. The tooltip follows the pointer vertically. The
 * popover keeps focus until it closes, then hands it back to what had it, never to the hidden mark,
 * unless a click outside focused something else.
 */
export function TimeGridAnnotationOverlays({
  formatTime,
  handles,
}: {
  readonly formatTime: (instant: Temporal.Instant) => string;
  readonly handles: TimeGridAnnotationHandles;
}) {
  const popup = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<Element | null>(null);
  const range = (mark: TimeGridAnnotationMarkData) => {
    const { end, start } = annotationRange(mark);
    return `${formatTime(start)} – ${formatTime(end)}`;
  };
  return (
    <>
      {/* Not hoverable: its hover bridge would sit under the pointer and swallow clicks. */}
      <TooltipPrimitive.Root disableHoverablePopup handle={handles.tooltip} trackCursorAxis="y">
        {({ payload }) =>
          payload === undefined ? null : (
            <TooltipContent
              side="inline-end"
              sideOffset={8}
              className="flex-col items-start gap-0.5"
            >
              <span className="font-medium">
                {payload.annotations.length === 1
                  ? payload.annotations[0]!.title
                  : payload.source.label}
              </span>
              <span className="opacity-70">
                {payload.annotations.length === 1
                  ? `${payload.source.label} · ${range(payload)}`
                  : `${range(payload)} · ${payload.annotations.length} items`}
              </span>
            </TooltipContent>
          )
        }
      </TooltipPrimitive.Root>
      <PopoverPrimitive.Root
        handle={handles.popover}
        // With a close button this also keeps Base UI's focus guards out of the hidden rail.
        modal="trap-focus"
        onOpenChange={(open) => {
          // Clicking another mark while open keeps focus in the popup: keep the first target.
          const active = document.activeElement;
          if (open && !popup.current?.contains(active)) returnFocus.current = active;
        }}
      >
        {({ payload }) => {
          if (payload === undefined) return null;
          const { color, Icon } = annotationSourceStyle(payload.source);
          return (
            <PopoverContent
              side="inline-end"
              align="start"
              sideOffset={8}
              className="w-72"
              ref={popup}
              // Marks open from a pointer, so the popup takes focus rather than its close button.
              initialFocus={popup}
              finalFocus={() => {
                // An outside click that focused something else keeps that focus.
                const active = document.activeElement;
                if (
                  active !== null &&
                  active !== document.body &&
                  !popup.current?.contains(active)
                ) {
                  return false;
                }
                const previous = returnFocus.current;
                return previous instanceof HTMLElement &&
                  previous.isConnected &&
                  previous !== document.body
                  ? previous
                  : false;
              }}
            >
              <div data-color={color} className="flex items-center gap-2">
                {Icon !== undefined && (
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-calendar-event-border text-background">
                    <Icon className="size-4" />
                  </span>
                )}
                <div className="min-w-0">
                  <PopoverPrimitive.Title className="truncate text-sm leading-tight font-medium">
                    {payload.annotations.length === 1
                      ? payload.annotations[0]!.title
                      : payload.source.label}
                  </PopoverPrimitive.Title>
                  <p className="text-xs text-muted-foreground tabular-nums">{range(payload)}</p>
                </div>
                <PopoverPrimitive.Close
                  render={<Button variant="ghost" size="icon-sm" className="ms-auto self-start" />}
                >
                  <XIcon />
                  <span className="sr-only">Close</span>
                </PopoverPrimitive.Close>
              </div>
              {payload.annotations.length > 1 && (
                <ul className="flex flex-col gap-1 text-xs">
                  {payload.annotations.slice(0, 5).map((annotation) => (
                    <li key={annotation.id} className="flex justify-between gap-3">
                      <span className="truncate">{annotation.title}</span>
                      <span className="shrink-0 text-muted-foreground tabular-nums">
                        {formatTime(annotation.start)}
                      </span>
                    </li>
                  ))}
                  {payload.annotations.length > 5 && (
                    <li className="text-muted-foreground">
                      and {payload.annotations.length - 5} more
                    </li>
                  )}
                </ul>
              )}
              <p className="border-t pt-2 text-[0.6875rem] text-muted-foreground">
                {payload.source.label} · read-only
              </p>
            </PopoverContent>
          );
        }}
      </PopoverPrimitive.Root>
    </>
  );
}
