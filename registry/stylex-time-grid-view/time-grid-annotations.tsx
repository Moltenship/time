"use client";

import {
  useCalendarAnnotations,
  useTimeGridAnnotations,
  type CalendarAnnotationSource,
  type TimeGridAnnotationMark,
  type TimeGridColumn,
} from "@moltenship/calendar";
import * as stylex from "@stylexjs/stylex";
import { XIcon } from "lucide-react";
import {
  cloneElement,
  createContext,
  use,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ComponentType,
  type CSSProperties,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";

import { visuallyHiddenStyles } from "@registry/shared/stylex-calendar-theme/visually-hidden.styles";
import { calendarVars } from "@registry/stylex-calendar-theme/calendar-tokens.stylex";
import { eventColorStyles } from "@registry/stylex-calendar-theme/event-color-styles";
import {
  calendarEventColors,
  type CalendarEventColor,
} from "@registry/stylex-calendar-theme/event-colors";
import { type XStyle, xprops } from "@registry/stylex-calendar-theme/xprops";
import { Button } from "@registry/stylex-calendar-ui/button";
import {
  createPopoverHandle,
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@registry/stylex-calendar-ui/popover";
import {
  createTooltipHandle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@registry/stylex-calendar-ui/tooltip";

import {
  annotationRangeText,
  annotationTitle,
  annotationTooltipDetail,
  POPOVER_ITEMS,
  type AnnotationFormats,
} from "@registry/shared/time-grid-view/annotation-label";
import {
  annotationMarkSizes,
  annotationSourceStyle as sharedSourceStyle,
  markPlacement,
  markVariables,
  MIN_ICON_WIDTH,
  resolveRail,
  type ResolvedAnnotationRail,
  type TimeGridAnnotationRail,
} from "@registry/shared/time-grid-view/annotation-layout";

export {
  annotationEventInset,
  bandBesideMarks,
  DEFAULT_COLUMN_HEIGHT,
  eventsBesideMarks,
} from "@registry/shared/time-grid-view/annotation-layout";
export type {
  AnnotationEventInset,
  TimeGridAnnotationRail,
} from "@registry/shared/time-grid-view/annotation-layout";

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
    lineHeight: 1.25,
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
  // Never under the pointer to swallow a click on the mark.
  markTooltip: {
    alignItems: "flex-start",
    flexDirection: "column",
    gap: "0.125rem",
    pointerEvents: "none",
  },
  markTooltipDetail: {
    opacity: 0.7,
  },
  markTooltipTitle: {
    fontWeight: 500,
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
  return sharedSourceStyle<CalendarEventColor, AnnotationIcon>(source, calendarEventColors);
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

/** The layout a time grid hands its columns and header. */
export interface TimeGridAnnotationLayout {
  /** Marks per column; empty when the root has no annotation sources. */
  readonly columns: readonly (readonly TimeGridAnnotationMarkData[])[];
  readonly enabled: boolean;
  /** The shortest a mark draws, as a fraction of the day; 0 for an overlay. */
  readonly minHeight: number;
  readonly options: TimeGridAnnotationOptions;
  readonly placement: "rail" | "overlay";
  readonly rail: ResolvedAnnotationRail;
}

/** What a grid hands its header and columns when the root has annotation sources. */
export interface TimeGridAnnotationWiring {
  readonly formats: AnnotationFormats;
  readonly handles: TimeGridAnnotationHandles;
  readonly layout: TimeGridAnnotationLayout;
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
  const { minGap, minHeight } = annotationMarkSizes(placement, markWidth, columnHeight);
  const marks = useTimeGridAnnotations(columns, { layout, minGap, minHeight });
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

export function useAnnotationHandles() {
  const [handles] = useState(() => ({
    popover: createPopoverHandle<TimeGridAnnotationMarkData>(),
    tooltip: createTooltipHandle<TimeGridAnnotationMarkData>(),
  }));
  return handles;
}

export type TimeGridAnnotationHandles = ReturnType<typeof useAnnotationHandles>;

interface AnnotationsContextValue {
  readonly handles: TimeGridAnnotationHandles;
  readonly placement: "rail" | "overlay";
  readonly rail: ResolvedAnnotationRail;
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

export interface AnnotationMarkProps extends ComponentProps<"div">, AnnotationMarkVariants {
  readonly mark: TimeGridAnnotationMarkData;
  /** Opens the details popover on click. */
  readonly details?: boolean;
  /** Your own element in place of the `div`; the mark's props merge into it. */
  readonly render?: ReactElement<ComponentProps<"div">>;
  readonly xstyle?: XStyle;
}

/**
 * One mark, wired to the grid's tooltip and details popover. Children read it through
 * `useAnnotationMark`; `render` swaps the element.
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
  const placement = markPlacement(rail, mark);
  const { width } = placement;
  const context = useMemo(() => ({ mark, width }), [mark, width]);
  const { color } = annotationSourceStyle(mark.source);
  const element = (
    <div
      {...props}
      data-annotation-id={String(mark.annotations[0]!.id)}
      // Pressing a mark never starts a drag in the grid.
      data-calendar-pointer="none"
      data-color={color}
      data-ends-after={mark.endsAfterDay ? "" : undefined}
      data-kind={mark.kind}
      data-slot="annotation-mark"
      data-source={mark.source.id}
      data-starts-before={mark.startsBeforeDay ? "" : undefined}
      // A click opens the details without focusing the mark, which sits in the aria-hidden rail.
      onMouseDown={(event: MouseEvent<HTMLDivElement>) => {
        onMouseDown?.(event);
        event.preventDefault();
      }}
      // Out of the tab order: the rail is aria-hidden.
      tabIndex={-1}
      {...xprops(
        {
          className,
          style: { ...markVariables(mark, placement), ...style } as CSSProperties,
        },
        styles.mark,
        markVariantStyles[variant ?? "capsule"],
        details && styles.markDetails,
        color !== undefined && eventColorStyles[color],
        xstyle,
      )}
    />
  );
  const tooltip = (
    <TooltipTrigger
      handle={handles.tooltip}
      payload={mark}
      render={render === undefined ? element : cloneWith(render, element)}
    />
  );

  return (
    <AnnotationMarkContext value={context}>
      {details ? (
        <PopoverTrigger handle={handles.popover} payload={mark} render={tooltip} />
      ) : (
        tooltip
      )}
    </AnnotationMarkContext>
  );
}

/**
 * `render` with the mark's props merged in: its own props win, the classes and styles add up, and
 * where both handle an event, its own handler runs first and then the mark's.
 */
function cloneWith(
  render: ReactElement<ComponentProps<"div">>,
  element: ReactElement<ComponentProps<"div">>,
): ReactElement {
  const own = render.props as Record<string, unknown>;
  const mark = element.props as Record<string, unknown>;
  const handlers: Record<string, unknown> = {};
  for (const [key, handler] of Object.entries(own)) {
    const markHandler = mark[key];
    if (
      !/^on[A-Z]/u.test(key) ||
      typeof handler !== "function" ||
      typeof markHandler !== "function"
    )
      continue;
    handlers[key] = (...args: unknown[]) => {
      handler(...args);
      markHandler(...args);
    };
  }
  const classNames = [element.props.className, render.props.className].filter(Boolean);
  return cloneElement(render, {
    ...element.props,
    ...render.props,
    ...handlers,
    className: classNames.length === 0 ? undefined : classNames.join(" "),
    style: { ...element.props.style, ...render.props.style },
  });
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

/**
 * One tooltip and one popover for every mark in the grid, through handles shared by every mark, so
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
  const [returnFocus, setReturnFocus] = useState<HTMLElement>();
  return (
    <>
      <Tooltip delay={0} handle={handles.tooltip} trackCursorAxis="y">
        {({ payload }) =>
          payload === undefined ? null : (
            <TooltipContent side="inline-end" sideOffset={8} xstyle={styles.markTooltip}>
              <span {...stylex.props(styles.markTooltipTitle)}>{annotationTitle(payload)}</span>
              <span {...stylex.props(styles.markTooltipDetail)}>
                {annotationTooltipDetail(payload, formatTime)}
              </span>
            </TooltipContent>
          )
        }
      </Tooltip>
      <Popover
        handle={handles.popover}
        // Keeps Tab inside, rather than moving on into the hidden rail.
        modal="trap-focus"
        onOpenChange={(open) => {
          // Clicking another mark while open keeps focus in the popup: keep the first target.
          const active = document.activeElement;
          if (!open || popup.current?.contains(active)) return;
          setReturnFocus(
            active instanceof HTMLElement && active !== document.body ? active : undefined,
          );
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
              // Back where focus was before a mark opened it, never into the hidden rail. ui-sdk
              // leaves focus alone after a click outside.
              finalFocus={returnFocus === undefined ? false : () => returnFocus}
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
                  <PopoverTitle xstyle={styles.detailsTitle}>
                    {annotationTitle(payload)}
                  </PopoverTitle>
                  <p {...stylex.props(styles.detailsRange)}>
                    {annotationRangeText(payload, formatTime)}
                  </p>
                </div>
                <PopoverClose
                  render={<Button size="icon-sm" variant="ghost" xstyle={styles.close} />}
                >
                  <XIcon {...stylex.props(styles.closeGlyph)} />
                  <span {...stylex.props(visuallyHiddenStyles.hidden)}>Close</span>
                </PopoverClose>
              </div>
              {payload.annotations.length > 1 && (
                <ul {...stylex.props(styles.items)}>
                  {payload.annotations.slice(0, POPOVER_ITEMS).map((annotation) => (
                    <li key={annotation.id} {...stylex.props(styles.item)}>
                      <span {...stylex.props(styles.itemTitle)}>{annotation.title}</span>
                      <span {...stylex.props(styles.itemTime)}>{formatTime(annotation.start)}</span>
                    </li>
                  ))}
                  {payload.annotations.length > POPOVER_ITEMS && (
                    <li {...stylex.props(styles.itemsMore)}>
                      and {payload.annotations.length - POPOVER_ITEMS} more
                    </li>
                  )}
                </ul>
              )}
              <p {...stylex.props(styles.detailsFoot)}>{payload.source.label} · read-only</p>
            </PopoverContent>
          );
        }}
      </Popover>
    </>
  );
}
