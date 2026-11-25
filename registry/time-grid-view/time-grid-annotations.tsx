"use client";

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

import {
  calendarEventColors,
  type CalendarEventColor,
} from "@registry/shared/calendar-theme/event-colors";
import { Button } from "@registry/calendar-ui/button";
import {
  createPopoverHandle,
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@registry/calendar-ui/popover";
import {
  createTooltipHandle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@registry/calendar-ui/tooltip";
import {
  annotationTitle,
  annotationTooltipDetail,
  annotationRangeText,
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
import {
  annotationMarkBaseClass,
  annotationMarkDetailsClass,
  annotationMarkIconClass,
  annotationMarkVariantClasses,
  annotationPopoverClass,
  annotationPopoverCloseClass,
  annotationPopoverFooterClass,
  annotationPopoverHeaderClass,
  annotationPopoverHeadingClass,
  annotationPopoverIconClass,
  annotationPopoverIconGlyphClass,
  annotationPopoverItemClass,
  annotationPopoverItemTimeClass,
  annotationPopoverItemTitleClass,
  annotationPopoverListClass,
  annotationPopoverMoreClass,
  annotationPopoverRangeClass,
  annotationPopoverTitleClass,
  annotationRailClass,
  annotationTooltipClass,
  annotationTooltipDetailClass,
  annotationTooltipTitleClass,
} from "@registry/shared/time-grid-view/time-grid.styles";
import { cn } from "cn";

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
export function AnnotationRail({ className, style, ...props }: ComponentProps<"div">) {
  const { placement, rail } = useAnnotationsContext();
  return (
    <div
      // The day's summary and each slot's name speak for the marks.
      aria-hidden
      data-slot="annotation-rail"
      data-placement={placement}
      data-side={rail.side}
      className={annotationRailClass(placement, className)}
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
export const annotationMarkVariants = cva(annotationMarkBaseClass, {
  variants: { variant: annotationMarkVariantClasses },
  defaultVariants: { variant: "capsule" },
});

export interface AnnotationMarkProps
  extends ComponentProps<"div">, VariantProps<typeof annotationMarkVariants> {
  readonly mark: TimeGridAnnotationMarkData;
  /** Opens the details popover on click. */
  readonly details?: boolean;
  /** Your own element in place of the `div`; the mark's props merge into it. */
  readonly render?: ReactElement<ComponentProps<"div">>;
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
  ...props
}: AnnotationMarkProps) {
  const { handles, rail } = useAnnotationsContext();
  const placement = markPlacement(rail, mark);
  const { width } = placement;
  const context = useMemo(() => ({ mark, width }), [mark, width]);
  const element = (
    <div
      {...props}
      className={cn(
        annotationMarkVariants({ variant }),
        details && annotationMarkDetailsClass,
        className,
      )}
      data-annotation-id={String(mark.annotations[0]!.id)}
      // Pressing a mark never starts a drag in the grid.
      data-calendar-pointer="none"
      data-color={annotationSourceStyle(mark.source).color}
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
      style={{ ...markVariables(mark, placement), ...style } as CSSProperties}
      // Out of the tab order: the rail is aria-hidden.
      tabIndex={-1}
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
  return cloneElement(render, {
    ...element.props,
    ...render.props,
    ...handlers,
    className: cn(element.props.className, render.props.className),
    style: { ...element.props.style, ...render.props.style },
  });
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
      className={annotationMarkIconClass(className)}
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
            <TooltipContent
              side="inline-end"
              sideOffset={8}
              // Never under the pointer to swallow a click on the mark.
              className={annotationTooltipClass}
            >
              <span className={annotationTooltipTitleClass}>{annotationTitle(payload)}</span>
              <span className={annotationTooltipDetailClass}>
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
              className={annotationPopoverClass}
              ref={popup}
              // Marks open from a pointer, so the popup takes focus rather than its close button.
              initialFocus={popup}
              // Back where focus was before a mark opened it, never into the hidden rail. ui-sdk
              // leaves focus alone after a click outside.
              finalFocus={returnFocus === undefined ? false : () => returnFocus}
            >
              <div data-color={color} className={annotationPopoverHeaderClass}>
                {Icon !== undefined && (
                  <span className={annotationPopoverIconClass}>
                    <Icon className={annotationPopoverIconGlyphClass} />
                  </span>
                )}
                <div className={annotationPopoverHeadingClass}>
                  <PopoverTitle className={annotationPopoverTitleClass}>
                    {annotationTitle(payload)}
                  </PopoverTitle>
                  <p className={annotationPopoverRangeClass}>
                    {annotationRangeText(payload, formatTime)}
                  </p>
                </div>
                <PopoverClose
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className={annotationPopoverCloseClass}
                    />
                  }
                >
                  <XIcon />
                  <span className="sr-only">Close</span>
                </PopoverClose>
              </div>
              {payload.annotations.length > 1 && (
                <ul className={annotationPopoverListClass}>
                  {payload.annotations.slice(0, POPOVER_ITEMS).map((annotation) => (
                    <li key={annotation.id} className={annotationPopoverItemClass}>
                      <span className={annotationPopoverItemTitleClass}>{annotation.title}</span>
                      <span className={annotationPopoverItemTimeClass}>
                        {formatTime(annotation.start)}
                      </span>
                    </li>
                  ))}
                  {payload.annotations.length > POPOVER_ITEMS && (
                    <li className={annotationPopoverMoreClass}>
                      and {payload.annotations.length - POPOVER_ITEMS} more
                    </li>
                  )}
                </ul>
              )}
              <p className={annotationPopoverFooterClass}>{payload.source.label} · read-only</p>
            </PopoverContent>
          );
        }}
      </Popover>
    </>
  );
}
