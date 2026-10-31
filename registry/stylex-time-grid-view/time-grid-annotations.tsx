"use client";

import { IconButton } from "@astryxdesign/core/IconButton";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { useRender } from "@base-ui/react/use-render";
import {
  useCalendarAnnotations,
  useTimeGridAnnotations,
  type CalendarAnnotationSource,
  type TimeGridAnnotationMark,
  type TimeGridBand,
  type TimeGridColumn,
} from "@moltenship/calendar";
import * as stylex from "@stylexjs/stylex";
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

import { calendarVars } from "@registry/stylex-calendar-theme/calendar-tokens.stylex";
import { eventColorStyles } from "@registry/stylex-calendar-theme/event-color-styles";
import {
  calendarEventColors,
  type CalendarEventColor,
} from "@registry/stylex-calendar-theme/event-colors";
import { type XStyle, xprops } from "@registry/stylex-calendar-theme/xprops";

import { annotationRange, type AnnotationFormats } from "./annotation-label";

const slideFromBottom = stylex.keyframes({
  from: { opacity: 0, transform: "translate3d(0, 0.5rem, 0) scale3d(0.95, 0.95, 0.95)" },
});
const slideFromLeft = stylex.keyframes({
  from: { opacity: 0, transform: "translate3d(-0.5rem, 0, 0) scale3d(0.95, 0.95, 0.95)" },
});
const slideFromRight = stylex.keyframes({
  from: { opacity: 0, transform: "translate3d(0.5rem, 0, 0) scale3d(0.95, 0.95, 0.95)" },
});
const slideFromTop = stylex.keyframes({
  from: { opacity: 0, transform: "translate3d(0, -0.5rem, 0) scale3d(0.95, 0.95, 0.95)" },
});
const zoomOut = stylex.keyframes({
  to: { opacity: 0, transform: "scale3d(0.95, 0.95, 0.95)" },
});

const styles = stylex.create({
  close: {
    alignSelf: "flex-start",
    marginInlineStart: "auto",
  },
  closeGlyph: {
    flexShrink: 0,
    height: "1rem",
    pointerEvents: "none",
    width: "1rem",
  },
  details: {
    alignItems: "center",
    display: "flex",
    gap: "0.5rem",
  },
  detailsFoot: {
    borderTopColor: calendarVars["--border"],
    borderTopStyle: "solid",
    borderTopWidth: 1,
    color: calendarVars["--muted-foreground"],
    fontSize: "0.6875rem",
    marginBlock: 0,
    paddingTop: "0.5rem",
  },
  detailsGlyph: {
    height: "1rem",
    width: "1rem",
  },
  detailsIcon: {
    alignItems: "center",
    backgroundColor: calendarVars["--calendar-event-border"],
    borderRadius: "9999px",
    color: calendarVars["--background"],
    display: "flex",
    flexShrink: 0,
    height: "1.75rem",
    justifyContent: "center",
    width: "1.75rem",
  },
  detailsRange: {
    color: calendarVars["--muted-foreground"],
    fontSize: "0.75rem",
    fontVariantNumeric: "tabular-nums",
    lineHeight: "1rem",
    marginBlock: 0,
  },
  detailsText: {
    minWidth: 0,
  },
  detailsTitle: {
    fontSize: "0.875rem",
    fontWeight: 500,
    lineHeight: 1.25,
    marginBlock: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  item: {
    display: "flex",
    gap: "0.75rem",
    justifyContent: "space-between",
  },
  items: {
    display: "flex",
    flexDirection: "column",
    fontSize: "0.75rem",
    gap: "0.25rem",
    lineHeight: "1rem",
    listStyle: "none",
    marginBlock: 0,
    paddingInlineStart: 0,
  },
  itemsMore: {
    color: calendarVars["--muted-foreground"],
  },
  itemTime: {
    color: calendarVars["--muted-foreground"],
    flexShrink: 0,
    fontVariantNumeric: "tabular-nums",
  },
  itemTitle: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  mark: {
    pointerEvents: "auto",
    position: "absolute",
    top: "min(var(--mark-top), calc(100% - var(--mark-min-height, 0px)))",
    transitionDuration: "100ms",
    transitionProperty: {
      default: "filter, background-color",
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
  },
  markBand: {
    backgroundColor: {
      default: `color-mix(in oklch, ${calendarVars["--calendar-event-border"]} 12%, transparent)`,
      ":hover": `color-mix(in oklch, ${calendarVars["--calendar-event-border"]} 24%, transparent)`,
    },
    borderInlineStartColor: calendarVars["--calendar-event-border"],
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: 2,
    height: "var(--mark-height)",
    insetInline: 0,
  },
  markBar: {
    "--mark-min-height": "3px",
  },
  markCapsule: {
    "--mark-min-height": "var(--mark-width)",
    boxShadow: "inset 0 0 0 1px light-dark(rgb(0 0 0 / 0.14), rgb(255 255 255 / 0.16))",
    maskImage: {
      default: null,
      "[data-ends-after]": "linear-gradient(to top, transparent, black 1.5rem)",
      "[data-starts-before]": {
        default: "linear-gradient(to bottom, transparent, black 1.5rem)",
        "[data-ends-after]":
          "linear-gradient(to bottom, transparent, black 1.5rem, black calc(100% - 1.5rem), transparent)",
      },
    },
  },
  markDetails: {
    cursor: "pointer",
  },
  markGlyph: {
    height: "62%",
    width: "62%",
  },
  markIcon: {
    alignItems: "center",
    aspectRatio: "1 / 1",
    backgroundColor: "rgb(255 255 255 / 0.35)",
    borderRadius: "9999px",
    color: "rgb(0 0 0 / 0.7)",
    display: "flex",
    insetInline: "1px",
    justifyContent: "center",
    position: "absolute",
    top: "1px",
  },
  markPill: {
    backgroundColor: calendarVars["--calendar-event-border"],
    borderBottomLeftRadius: { default: "9999px", "[data-ends-after]": 0 },
    borderBottomRightRadius: { default: "9999px", "[data-ends-after]": 0 },
    borderTopLeftRadius: { default: "9999px", "[data-starts-before]": 0 },
    borderTopRightRadius: { default: "9999px", "[data-starts-before]": 0 },
    filter: { default: null, ":hover": "brightness(1.1)" },
    height: "max(var(--mark-min-height), calc(var(--mark-height) - 1px))",
    insetInlineStart: "var(--mark-offset)",
    width: "var(--mark-width)",
  },
  markTooltip: {
    alignItems: "flex-start",
    flexDirection: "column",
    gap: "0.125rem",
  },
  markTooltipDetail: {
    opacity: 0.7,
  },
  markTooltipTitle: {
    fontWeight: 500,
  },
  popover: {
    animationDuration: { default: "100ms", "@media (prefers-reduced-motion: reduce)": "0s" },
    animationName: {
      default: null,
      "[data-closed]": zoomOut,
      "[data-open]": {
        default: null,
        '[data-side="bottom"]': slideFromTop,
        '[data-side="inline-end"]': slideFromLeft,
        '[data-side="inline-start"]': slideFromRight,
        '[data-side="left"]': slideFromRight,
        '[data-side="right"]': slideFromLeft,
        '[data-side="top"]': slideFromBottom,
      },
    },
    backgroundColor: calendarVars["--popover"],
    borderRadius: "var(--radius)",
    boxShadow: `0 0 0 1px color-mix(in oklch, ${calendarVars["--foreground"]} 10%, transparent), 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)`,
    color: calendarVars["--popover-foreground"],
    display: "flex",
    flexDirection: "column",
    fontSize: "0.875rem",
    gap: "0.625rem",
    lineHeight: "calc(1.25 / 0.875)",
    outlineStyle: "none",
    padding: "0.625rem",
    transformOrigin: "var(--transform-origin)",
    width: "18rem",
    zIndex: 50,
  },
  positioner: {
    isolation: "isolate",
    zIndex: 50,
  },
  rail: {
    insetBlock: 0,
    pointerEvents: "none",
    position: "absolute",
  },
  railOverlay: {
    insetInline: 0,
    zIndex: 0,
  },
  railStrip: {
    insetInlineEnd: { default: null, '[data-side="end"]': 0 },
    insetInlineStart: { default: null, '[data-side="start"]': 0 },
    width: "var(--calendar-annotation-rail-width)",
    zIndex: 5,
  },
  tooltip: {
    alignItems: "center",
    animationDuration: { default: "150ms", "@media (prefers-reduced-motion: reduce)": "0s" },
    animationName: {
      default: null,
      "[data-closed]": zoomOut,
      "[data-open]": {
        default: null,
        '[data-side="bottom"]': slideFromTop,
        '[data-side="inline-end"]': slideFromLeft,
        '[data-side="inline-start"]': slideFromRight,
        '[data-side="left"]': slideFromRight,
        '[data-side="right"]': slideFromLeft,
        '[data-side="top"]': slideFromBottom,
      },
    },
    backgroundColor: calendarVars["--foreground"],
    borderRadius: "calc(var(--radius) * 0.8)",
    color: calendarVars["--background"],
    display: "inline-flex",
    fontSize: "0.75rem",
    gap: "0.375rem",
    lineHeight: "1rem",
    maxWidth: "20rem",
    paddingBlock: "0.375rem",
    paddingInline: "0.75rem",
    transformOrigin: "var(--transform-origin)",
    width: "fit-content",
    zIndex: 50,
  },
  tooltipArrow: {
    backgroundColor: calendarVars["--foreground"],
    borderRadius: "2px",
    bottom: { default: null, '[data-side="top"]': "-0.625rem" },
    fill: calendarVars["--foreground"],
    height: "0.625rem",
    left: {
      default: null,
      '[data-side="inline-end"]': "-0.25rem",
      '[data-side="right"]': "-0.25rem",
    },
    right: {
      default: null,
      '[data-side="inline-start"]': "-0.25rem",
      '[data-side="left"]': "-0.25rem",
    },
    rotate: "45deg",
    top: {
      default: null,
      '[data-side="bottom"]': "0.25rem",
      '[data-side="inline-end"]': "50% !important",
      '[data-side="inline-start"]': "50% !important",
      '[data-side="left"]': "50% !important",
      '[data-side="right"]': "50% !important",
    },
    translate: {
      default: "0 calc(-50% - 2px)",
      '[data-side="inline-end"]': "0 -50%",
      '[data-side="inline-start"]': "0 -50%",
      '[data-side="left"]': "0 -50%",
      '[data-side="right"]': "0 -50%",
    },
    width: "0.625rem",
    zIndex: 50,
  },
});

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
  /**
   * `rail` draws marks in a strip, and the events beside them move aside for it; `overlay` gives
   * the parts the whole column, behind events.
   */
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
  /** The shortest a mark draws, as a fraction of the day; 0 for an overlay. */
  readonly minHeight: number;
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
  const minHeight = overlay ? 0 : markWidth / columnHeight;
  const marks = useTimeGridAnnotations(columns, {
    layout,
    minGap: overlay ? 0 : MIN_GAP_PX / columnHeight,
    minHeight,
  });
  return useMemo(
    () => ({
      columns: marks,
      enabled: sources.length > 0,
      minHeight,
      options,
      placement,
      rail: { layout, markWidth, side, width },
    }),
    [layout, markWidth, marks, minHeight, options, placement, side, sources.length, width],
  );
}

/** Px an event keeps free at each side of the column's event area, for the rail. */
export interface AnnotationEventInset {
  readonly end: number;
  readonly start: number;
}

/** The strip the event area already keeps free at its end, for creating beside busy blocks. */
const CREATE_STRIP = 8;
/** Bands this close, as fractions of a day, meet rather than overlap, as in the event layout. */
const EDGE_TOLERANCE = 1e-9;

/** What the rail takes from the events beside its marks; `undefined` when it takes nothing. */
export function annotationEventInset(
  layout: TimeGridAnnotationLayout,
): AnnotationEventInset | undefined {
  if (!layout.enabled || layout.placement === "overlay") return undefined;
  return layout.rail.side === "start"
    ? { end: 0, start: layout.rail.width }
    : { end: Math.max(0, layout.rail.width + 2 - CREATE_STRIP), start: 0 };
}

/**
 * Whether a band crosses one of the column's marks as the rail draws it: never shorter than the
 * layout's `minHeight`, and drawn up from the day's end when too close to midnight to fit.
 */
export function bandBesideMarks(
  layout: TimeGridAnnotationLayout,
  marks: readonly TimeGridAnnotationMarkData[],
  { height, top }: TimeGridBand,
): boolean {
  return marks.some((mark) => {
    const from = Math.min(mark.top, 1 - layout.minHeight);
    const to = Math.max(mark.top + mark.height, from + layout.minHeight);
    return top < to - EDGE_TOLERANCE && from < top + height - EDGE_TOLERANCE;
  });
}

/**
 * Which of a column's events move aside for the rail. Overlapping events form groups as the
 * event layout groups them, and a group moves as one when any of its events is beside a mark, so
 * its events keep their places beside each other. Every other event keeps the column's width.
 */
export function eventsBesideMarks(
  layout: TimeGridAnnotationLayout,
  marks: readonly TimeGridAnnotationMarkData[],
  events: readonly TimeGridBand[],
): readonly boolean[] {
  const moved = events.map(() => false);
  if (marks.length === 0) return moved;
  const order = events.map((_, index) => index).sort((a, b) => events[a]!.top - events[b]!.top);
  let group: number[] = [];
  let bottom = -Infinity;
  const place = () => {
    if (group.some((index) => bandBesideMarks(layout, marks, events[index]!))) {
      for (const index of group) moved[index] = true;
    }
  };
  for (const index of order) {
    const { height, top } = events[index]!;
    if (bottom <= top + EDGE_TOLERANCE) {
      place();
      group = [];
    }
    group.push(index);
    bottom = Math.max(bottom, top + height);
  }
  place();
  return moved;
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
export function AnnotationRail({
  className,
  style,
  xstyle,
  ...props
}: ComponentProps<"div"> & { readonly xstyle?: XStyle }) {
  const { placement, rail } = useAnnotationsContext();
  return (
    <div
      // The day's summary and each slot's name speak for the marks.
      aria-hidden
      data-slot="annotation-rail"
      data-placement={placement}
      data-side={rail.side}
      {...props}
      {...xprops(
        {
          className,
          style: {
            "--calendar-annotation-rail-width": `${rail.width}px`,
            ...style,
          } as CSSProperties,
        },
        styles.rail,
        placement === "overlay" ? styles.railOverlay : styles.railStrip,
        xstyle,
      )}
    />
  );
}

/**
 * Geometry arrives as CSS variables: `--mark-top` and `--mark-height` as fractions of the day,
 * `--mark-offset` and `--mark-width` in px inside the rail. A variant's `--mark-min-height` keeps
 * a short mark near midnight inside the day, drawn up from its end as the layout measures it.
 */
export function annotationMarkVariants({ variant }: AnnotationMarkVariants = {}) {
  return stylex.props(styles.mark, markVariantStyles[variant ?? "capsule"]).className;
}

interface AnnotationMarkVariants {
  /**
   * `capsule` is never shorter than it is wide, so a short one is a circle; `bar` is a thin bar
   * that keeps its true length; `band` is a tint across the column behind events, for
   * `placement: "overlay"`.
   */
  readonly variant?: "bar" | "band" | "capsule" | null;
}

const markPill = styles.markPill;
const markVariantStyles = {
  band: styles.markBand,
  bar: [markPill, styles.markBar],
  capsule: [markPill, styles.markCapsule],
};

export interface AnnotationMarkProps
  extends useRender.ComponentProps<"div">, AnnotationMarkVariants {
  readonly mark: TimeGridAnnotationMarkData;
  /** Opens the details popover on click. */
  readonly details?: boolean;
  readonly xstyle?: XStyle;
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
  xstyle,
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
  const { color } = annotationSourceStyle(mark.source);
  const element = useRender({
    defaultTagName: "div",
    props: {
      ...props,
      "data-annotation-id": String(mark.annotations[0]!.id),
      // Pressing a mark never starts a drag in the grid.
      "data-calendar-pointer": "none",
      "data-color": color,
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
      ...xprops(
        {
          className,
          style: {
            "--mark-height": `${mark.height * 100}%`,
            "--mark-offset": `${offset}px`,
            "--mark-top": `${mark.top * 100}%`,
            "--mark-width": `${width}px`,
            ...style,
          } as CSSProperties,
        },
        styles.mark,
        markVariantStyles[variant ?? "capsule"],
        details && styles.markDetails,
        color !== undefined && eventColorStyles[color],
        xstyle,
      ),
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
export function AnnotationMarkIcon({
  children,
  className,
  style,
  xstyle,
  ...props
}: ComponentProps<"span"> & { readonly xstyle?: XStyle }) {
  const { mark, width } = useAnnotationMark();
  const { Icon } = annotationSourceStyle(mark.source);
  const icon =
    children ??
    (Icon === undefined ? null : <Icon className={stylex.props(styles.markGlyph).className} />);
  if (icon === null || mark.startsBeforeDay || width < MIN_ICON_WIDTH) return null;
  return (
    <span
      data-slot="annotation-mark-icon"
      {...props}
      {...xprops({ className, style }, styles.markIcon, xstyle)}
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

function TooltipContent({
  children,
  side,
  sideOffset,
  xstyle,
}: Pick<TooltipPrimitive.Positioner.Props, "side" | "sideOffset"> & {
  readonly children: ReactNode;
  readonly xstyle?: XStyle;
}) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align="center"
        alignOffset={0}
        side={side}
        sideOffset={sideOffset}
        {...stylex.props(styles.positioner)}
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          {...stylex.props(styles.tooltip, xstyle)}
        >
          {children}
          <TooltipPrimitive.Arrow {...stylex.props(styles.tooltipArrow)} />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

function PopoverContent({
  align,
  side,
  sideOffset,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<PopoverPrimitive.Positioner.Props, "align" | "side" | "sideOffset">) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={0}
        side={side}
        sideOffset={sideOffset}
        {...stylex.props(styles.positioner)}
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          {...stylex.props(styles.popover)}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
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
            <TooltipContent side="inline-end" sideOffset={8} xstyle={styles.markTooltip}>
              <span {...stylex.props(styles.markTooltipTitle)}>
                {payload.annotations.length === 1
                  ? payload.annotations[0]!.title
                  : payload.source.label}
              </span>
              <span {...stylex.props(styles.markTooltipDetail)}>
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
              <div
                data-color={color}
                {...stylex.props(styles.details, color !== undefined && eventColorStyles[color])}
              >
                {Icon !== undefined && (
                  <span {...stylex.props(styles.detailsIcon)}>
                    <Icon className={stylex.props(styles.detailsGlyph).className} />
                  </span>
                )}
                <div {...stylex.props(styles.detailsText)}>
                  <PopoverPrimitive.Title {...stylex.props(styles.detailsTitle)}>
                    {payload.annotations.length === 1
                      ? payload.annotations[0]!.title
                      : payload.source.label}
                  </PopoverPrimitive.Title>
                  <p {...stylex.props(styles.detailsRange)}>{range(payload)}</p>
                </div>
                <PopoverPrimitive.Close
                  render={
                    <IconButton
                      icon={<XIcon {...stylex.props(styles.closeGlyph)} />}
                      label="Close"
                      size="sm"
                      variant="ghost"
                      xstyle={styles.close}
                    />
                  }
                />
              </div>
              {payload.annotations.length > 1 && (
                <ul {...stylex.props(styles.items)}>
                  {payload.annotations.slice(0, 5).map((annotation) => (
                    <li key={annotation.id} {...stylex.props(styles.item)}>
                      <span {...stylex.props(styles.itemTitle)}>{annotation.title}</span>
                      <span {...stylex.props(styles.itemTime)}>{formatTime(annotation.start)}</span>
                    </li>
                  ))}
                  {payload.annotations.length > 5 && (
                    <li {...stylex.props(styles.itemsMore)}>
                      and {payload.annotations.length - 5} more
                    </li>
                  )}
                </ul>
              )}
              <p {...stylex.props(styles.detailsFoot)}>{payload.source.label} · read-only</p>
            </PopoverContent>
          );
        }}
      </PopoverPrimitive.Root>
    </>
  );
}
