import {
  useCalendarAnnotations,
  useTimeGridAnnotations,
  type CalendarAnnotationSource,
  type TimeGridAnnotationMark,
  type TimeGridColumn,
} from "@moltenship/calendar-solid";
import { Dynamic, type JSX } from "@solidjs/web";
import {
  createContext,
  createMemo,
  createSignal,
  For,
  merge,
  omit,
  Show,
  useContext,
  type Accessor,
  type Component,
} from "solid-js";

import {
  calendarEventColors,
  type CalendarEventColor,
} from "@registry/shared/calendar-theme/event-colors";
import { Button } from "@registry/calendar-ui/button";
import { XIcon } from "@registry/calendar-ui/icons";
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
  type AnnotationMarkVariant,
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

type AnnotationIcon = Component<{ readonly class?: string }>;

/** A source with how the time grid draws it. */
export interface TimeGridAnnotationSource extends CalendarAnnotationSource {
  /** Sets `data-color` on its marks; without it they use the theme's default event colour. */
  readonly color?: CalendarEventColor;
  /** Drawn inside the top of its marks. */
  readonly Icon?: AnnotationIcon;
}

export type TimeGridAnnotationMarkData = TimeGridAnnotationMark;

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
  readonly Annotations?: Component<TimeGridAnnotationsProps>;
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

const noOptions: TimeGridAnnotationOptions = {};

/**
 * Lays the root's annotations out for a grid's columns, as an accessor. Merging and lane packing
 * use the drawn size, so they need the column's height in px.
 */
export function useTimeGridAnnotationLayout(
  columns: Accessor<readonly TimeGridColumn[]>,
  options: Accessor<TimeGridAnnotationOptions | undefined>,
  size: Accessor<{ readonly columnHeight: number; readonly dense: boolean }>,
): Accessor<TimeGridAnnotationLayout> {
  const annotations = useCalendarAnnotations();
  const geometry = createMemo(() => {
    const own = options() ?? noOptions;
    const placement = own.placement ?? "rail";
    const { columnHeight, dense } = size();
    const rail = resolveRail(own.rail, dense);
    return {
      ...annotationMarkSizes(placement, rail.markWidth, columnHeight),
      options: own,
      placement,
      rail,
    };
  });
  const marks = useTimeGridAnnotations(columns, () => {
    const { minGap, minHeight, rail } = geometry();
    return { layout: rail.layout, minGap, minHeight };
  });
  return createMemo(() => {
    const { minHeight, options: own, placement, rail } = geometry();
    return {
      columns: marks(),
      enabled: annotations().sources.length > 0,
      minHeight,
      options: own,
      placement,
      rail,
    };
  });
}

/** The tooltip and popover every mark of a grid shares. */
export function createAnnotationHandles() {
  return {
    popover: createPopoverHandle<TimeGridAnnotationMarkData>(),
    tooltip: createTooltipHandle<TimeGridAnnotationMarkData>(),
  };
}

export type TimeGridAnnotationHandles = ReturnType<typeof createAnnotationHandles>;

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

const AnnotationsContext = createContext<AnnotationsContextValue | undefined>(undefined);
const AnnotationMarkContext = createContext<AnnotationMarkContextValue | undefined>(undefined);

function useAnnotationsContext(): AnnotationsContextValue {
  const context = useContext(AnnotationsContext);
  if (context === undefined) throw new Error("Annotation parts render inside a time grid column.");
  return context;
}

/** The mark an `AnnotationMark` renders and its width, for parts inside it. Its fields follow it. */
export function useAnnotationMark(): AnnotationMarkContextValue {
  const context = useContext(AnnotationMarkContext);
  if (context === undefined) {
    throw new Error("useAnnotationMark is for parts inside an AnnotationMark.");
  }
  return context;
}

/** Provides one column's annotation context to the parts; the column renders it. */
export function TimeGridAnnotationProvider(props: {
  readonly children?: JSX.Element;
  readonly handles: TimeGridAnnotationHandles;
  readonly layout: TimeGridAnnotationLayout;
}) {
  const value: AnnotationsContextValue = {
    get handles() {
      return props.handles;
    },
    get placement() {
      return props.layout.placement;
    },
    get rail() {
      return props.layout.rail;
    },
  };
  return <AnnotationsContext value={value}>{props.children}</AnnotationsContext>;
}

export interface AnnotationRailProps {
  readonly children?: JSX.Element;
  readonly class?: string;
  readonly style?: JSX.CSSProperties;
}

/** The strip a column's marks sit in: beside events, or across the column for an overlay. */
export function AnnotationRail(props: AnnotationRailProps) {
  const context = useAnnotationsContext();
  return (
    <div
      // The day's summary and each slot's name speak for the marks.
      aria-hidden="true"
      data-slot="annotation-rail"
      data-placement={context.placement}
      data-side={context.rail.side}
      class={annotationRailClass(context.placement, props.class)}
      style={{ "--calendar-annotation-rail-width": `${context.rail.width}px`, ...props.style }}
    >
      {props.children}
    </div>
  );
}

/**
 * A mark's classes for its `variant`, `capsule` by default. Geometry arrives as CSS variables:
 * `--mark-top` and `--mark-height` as fractions of the day, `--mark-offset` and `--mark-width` in
 * px inside the rail. A variant's `--mark-min-height` keeps a short mark near midnight inside the
 * day, drawn up from its end as the layout measures it.
 */
export function annotationMarkVariants(
  options: { readonly variant?: AnnotationMarkVariant | null } = {},
): string {
  return cn(annotationMarkBaseClass, annotationMarkVariantClasses[options.variant ?? "capsule"]);
}

/** The props an `AnnotationMark`'s `render` spreads on its element. */
export type AnnotationMarkElementProps = JSX.HTMLAttributes<HTMLDivElement> &
  Record<`data-${string}`, string | undefined>;

export interface AnnotationMarkProps {
  readonly children?: JSX.Element;
  readonly class?: string;
  /** Opens the details popover on click. */
  readonly details?: boolean;
  readonly mark: TimeGridAnnotationMarkData;
  /**
   * Your own element in place of the `div`: a function of the mark's props, which you spread on
   * it. They place it, wire its tooltip and popover, and hold the children.
   */
  readonly render?: (props: AnnotationMarkElementProps) => JSX.Element;
  readonly style?: JSX.CSSProperties;
  readonly variant?: AnnotationMarkVariant | null;
}

type MouseHandler = (event: MouseEvent) => void;

/** Calls a handler as Solid would: a function, or a bound `[handler, data]` pair. */
function callHandler(handler: unknown, event: MouseEvent) {
  if (typeof handler === "function") (handler as MouseHandler)(event);
  else if (Array.isArray(handler))
    (handler[0] as (data: unknown, event: MouseEvent) => void)(handler[1], event);
}

/**
 * One mark, wired to the grid's tooltip and details popover. Children read it through
 * `useAnnotationMark`; `render` swaps the element.
 */
export function AnnotationMark(props: AnnotationMarkProps) {
  const context = useAnnotationsContext();
  const placement = createMemo(() => markPlacement(context.rail, props.mark));
  const details = () => props.details !== false;
  const markContext: AnnotationMarkContextValue = {
    get mark() {
      return props.mark;
    },
    get width() {
      return placement().width;
    },
  };

  /** The mark's own props, over the triggers' props, whose handlers and ref still run. */
  const element = (trigger: Record<string, unknown>) => {
    const own = {
      get children() {
        return props.children;
      },
      get class() {
        return cn(
          annotationMarkVariants({ variant: props.variant }),
          details() && annotationMarkDetailsClass,
          props.class,
        );
      },
      get "data-annotation-id"() {
        return String(props.mark.annotations[0]!.id);
      },
      // Pressing a mark never starts a drag in the grid.
      "data-calendar-pointer": "none",
      get "data-color"() {
        return annotationSourceStyle(props.mark.source).color;
      },
      get "data-ends-after"() {
        return props.mark.endsAfterDay ? "" : undefined;
      },
      get "data-kind"() {
        return props.mark.kind;
      },
      "data-slot": "annotation-mark",
      get "data-source"() {
        return props.mark.source.id;
      },
      get "data-starts-before"() {
        return props.mark.startsBeforeDay ? "" : undefined;
      },
      // A click opens the details without focusing the mark, which sits in the aria-hidden rail.
      onMouseDown: (event: MouseEvent) => {
        callHandler(trigger.onMouseDown, event);
        event.preventDefault();
      },
      get style() {
        return { ...markVariables(props.mark, placement()), ...props.style };
      },
      // Out of the tab order: the rail is aria-hidden.
      tabindex: -1,
    };
    // The id first, as React sets it, so the element's attributes read in the same order.
    const all = merge(
      { id: trigger.id },
      omit(trigger, "id", "onMouseDown"),
      own,
    ) as AnnotationMarkElementProps;
    const render = props.render;
    return render === undefined ? <div {...all} /> : render(all);
  };

  const tooltip = (popover: Record<string, unknown>) => (
    <TooltipTrigger
      {...popover}
      handle={context.handles.tooltip}
      payload={props.mark}
      render={(trigger) => element(trigger as Record<string, unknown>)}
    />
  );

  return (
    <AnnotationMarkContext value={markContext}>
      <Show when={details()} fallback={tooltip({})}>
        <PopoverTrigger
          handle={context.handles.popover}
          payload={props.mark}
          render={(trigger) => tooltip(trigger as Record<string, unknown>)}
        />
      </Show>
    </AnnotationMarkContext>
  );
}

export interface AnnotationMarkIconProps {
  /** Replaces the source's icon, such as a brand logo. */
  readonly children?: JSX.Element;
  readonly class?: string;
}

/**
 * The source's icon in a disc at the top of the mark. Children replace it, such as a brand logo.
 * It hides when the mark continues from the day before or is too narrow.
 */
export function AnnotationMarkIcon(props: AnnotationMarkIconProps) {
  const context = useAnnotationMark();
  const Icon = () => annotationSourceStyle(context.mark.source).Icon;
  const shown = () =>
    !context.mark.startsBeforeDay &&
    context.width >= MIN_ICON_WIDTH &&
    ("children" in props || Icon() !== undefined);
  return (
    <Show when={shown()}>
      <span data-slot="annotation-mark-icon" class={annotationMarkIconClass(props.class)}>
        <Show when={"children" in props} fallback={<Dynamic component={Icon()} />}>
          {props.children}
        </Show>
      </span>
    </Show>
  );
}

/** The default composition: capsules in the source's colour with its icon inside the top. */
export function TimeGridAnnotations(props: TimeGridAnnotationsProps) {
  return (
    <AnnotationRail>
      <For each={props.marks} keyed={(mark: TimeGridAnnotationMarkData) => mark.key}>
        {(mark) => (
          <AnnotationMark mark={mark()}>
            <AnnotationMarkIcon />
          </AnnotationMark>
        )}
      </For>
    </AnnotationRail>
  );
}

/**
 * One tooltip and one popover for every mark in the grid, through handles shared by every mark, so
 * hundreds of marks never mount hundreds of roots. The tooltip follows the pointer vertically. The
 * popover keeps focus until it closes, then hands it back to what had it, never to the hidden mark,
 * unless a click outside focused something else.
 */
export function TimeGridAnnotationOverlays(props: {
  readonly formatTime: (instant: Temporal.Instant) => string;
  readonly handles: TimeGridAnnotationHandles;
}) {
  let popup: HTMLDivElement | undefined;
  const [returnFocus, setReturnFocus] = createSignal<HTMLElement | undefined>(undefined, {
    ownedWrite: true,
  });
  return (
    <>
      <Tooltip delay={0} handle={props.handles.tooltip} trackCursorAxis="y">
        {(state: { readonly payload: TimeGridAnnotationMarkData | undefined }) => (
          <Show when={state.payload}>
            {(payload) => (
              <TooltipContent
                side="inline-end"
                sideOffset={8}
                // Never under the pointer to swallow a click on the mark.
                class={annotationTooltipClass}
              >
                <span class={annotationTooltipTitleClass}>{annotationTitle(payload())}</span>
                <span class={annotationTooltipDetailClass}>
                  {annotationTooltipDetail(payload(), props.formatTime)}
                </span>
              </TooltipContent>
            )}
          </Show>
        )}
      </Tooltip>
      <Popover
        handle={props.handles.popover}
        // Keeps Tab inside, rather than moving on into the hidden rail.
        modal="trap-focus"
        onOpenChange={(open) => {
          // Clicking another mark while open keeps focus in the popup: keep the first target.
          const active = document.activeElement;
          if (!open || popup?.contains(active) === true) return;
          setReturnFocus(
            active instanceof HTMLElement && active !== document.body ? active : undefined,
          );
        }}
      >
        {(state: { readonly payload: TimeGridAnnotationMarkData | undefined }) => (
          <Show when={state.payload}>
            {(payload) => {
              const style = () => annotationSourceStyle(payload().source);
              return (
                <PopoverContent
                  side="inline-end"
                  align="start"
                  sideOffset={8}
                  class={annotationPopoverClass}
                  ref={(element) => {
                    popup = element;
                  }}
                  // Marks open from a pointer, so the popup takes focus rather than its close
                  // button.
                  initialFocus={() => popup}
                  // Back where focus was before a mark opened it, never into the hidden rail.
                  // ui-sdk leaves focus alone after a click outside.
                  finalFocus={returnFocus() === undefined ? false : () => returnFocus() ?? null}
                >
                  <div data-color={style().color} class={annotationPopoverHeaderClass}>
                    <Show when={style().Icon}>
                      {(Icon) => (
                        <span class={annotationPopoverIconClass}>
                          <Dynamic component={Icon()} class={annotationPopoverIconGlyphClass} />
                        </span>
                      )}
                    </Show>
                    <div class={annotationPopoverHeadingClass}>
                      <PopoverTitle class={annotationPopoverTitleClass}>
                        {annotationTitle(payload())}
                      </PopoverTitle>
                      <p class={annotationPopoverRangeClass}>
                        {annotationRangeText(payload(), props.formatTime)}
                      </p>
                    </div>
                    <PopoverClose
                      render={(close) => (
                        <Button
                          {...close}
                          variant="ghost"
                          size="icon-sm"
                          class={annotationPopoverCloseClass}
                        />
                      )}
                    >
                      <XIcon />
                      <span class="sr-only">Close</span>
                    </PopoverClose>
                  </div>
                  <Show when={payload().annotations.length > 1}>
                    <ul class={annotationPopoverListClass}>
                      <For
                        each={payload().annotations.slice(0, POPOVER_ITEMS)}
                        keyed={(annotation) => annotation.id}
                      >
                        {(annotation) => (
                          <li class={annotationPopoverItemClass}>
                            <span class={annotationPopoverItemTitleClass}>
                              {annotation().title}
                            </span>
                            <span class={annotationPopoverItemTimeClass}>
                              {props.formatTime(annotation().start)}
                            </span>
                          </li>
                        )}
                      </For>
                      <Show when={payload().annotations.length > POPOVER_ITEMS}>
                        <li class={annotationPopoverMoreClass}>
                          and {payload().annotations.length - POPOVER_ITEMS} more
                        </li>
                      </Show>
                    </ul>
                  </Show>
                  <p class={annotationPopoverFooterClass}>{payload().source.label} · read-only</p>
                </PopoverContent>
              );
            }}
          </Show>
        )}
      </Popover>
    </>
  );
}
