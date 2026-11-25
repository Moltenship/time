import type {
  EventDayFragment,
  EventId,
  ResourceId,
  TimeGridEventLayout,
} from "@moltenship/calendar-solid";
import type { JSX } from "@solidjs/web";
import {
  createContext,
  createEffect,
  createMemo,
  merge,
  omit,
  Show,
  untrack,
  useContext,
} from "solid-js";

import { EventChip, EventIcon, useEventChip } from "@registry/calendar/event-chip";
import type { EventLabeler } from "@registry/calendar/event-label";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import {
  eventTimeRange,
  isClipped,
  isCompact,
  laneBox,
  percent,
  resizeHandles,
  wallTimes,
  type EventInset,
  type TimeGridEventFormats,
} from "@registry/shared/time-grid-view/time-grid-geometry";
import { compactTimeSeparator } from "@registry/shared/time-grid-view/time-grid-labels";
import {
  timeGridCompactIconClass,
  timeGridCompactLineClass,
  timeGridCompactTimeClass,
  timeGridEventClass,
  timeGridEventTimeClass,
  timeGridEventTitleClass,
  timeGridResizeEndClass,
  timeGridResizeStartClass,
} from "@registry/shared/time-grid-view/time-grid.styles";
import {
  createTooltipHandle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  type TooltipHandle,
} from "@registry/calendar-ui/tooltip";

export { eventTimeRange, percent } from "@registry/shared/time-grid-view/time-grid-geometry";
export type { TimeGridEventFormats } from "@registry/shared/time-grid-view/time-grid-geometry";

export interface TimeGridEventProps<TEvent> {
  readonly color?: CalendarEventColor;
  readonly formats: TimeGridEventFormats;
  /** Shown before the title, from the view's `getEventIcon`. */
  readonly icon?: JSX.Element;
  /**
   * Px kept free at each side of the event area, for the annotation rail when a mark is beside
   * the event or the events it shares space with. Its lanes share the rest.
   */
  readonly inset?: EventInset;
  /** The root takes no changes, so the event has no resize handles. */
  readonly isReadOnly?: boolean;
  readonly labelEvent: EventLabeler<TEvent>;
  readonly layout: TimeGridEventLayout<EventDayFragment<TEvent, EventId, ResourceId>>;
  /** Rendered beside the visible dates of a scrolling grid: not a focus target. */
  readonly offscreen?: boolean;
  /** The resource this copy shows in, in a view with a column per resource. */
  readonly resourceId?: ResourceId | null;
  readonly timeZone: string;
}

/** What an event hands the shared tooltip: its full name, its title, and whether it's cut short. */
interface EventTooltipPayload {
  readonly clipped: () => boolean;
  readonly label: string;
  readonly title: string;
}

const EventTooltipContext = createContext<TooltipHandle<EventTooltipPayload> | undefined>(
  undefined,
);

/**
 * One tooltip for every event inside it, so a grid of hundreds of events mounts one tooltip
 * rather than one each. Wrap a view's grid in it; it renders the tooltip after the grid, not
 * inside it. An event outside one brings its own.
 */
export function TimeGridEventTooltip(props: { readonly children?: JSX.Element }) {
  const handle = createTooltipHandle<EventTooltipPayload>();
  return (
    <EventTooltipContext value={handle}>
      {props.children}
      <Tooltip
        // A clipped title shows at once, as the annotations' tooltip does.
        delay={0}
        handle={handle}
        onOpenChange={(open, details) => {
          // A title that fits needs no tooltip; one passed on by an event it fits closes.
          if (!open || details.payload?.clipped() === true) return;
          details.cancel();
          handle.close();
        }}
      >
        {(state: { readonly payload: EventTooltipPayload | undefined }) => (
          // The tooltip names the event, so it carries the event's full name.
          <TooltipContent aria-label={state.payload?.label}>{state.payload?.title}</TooltipContent>
        )}
      </Tooltip>
    </EventTooltipContext>
  );
}

/**
 * A positioned event: title and time range, or one compact line when short. Render a column's
 * events in layout order, so stacked events draw over the ones they overlap. Resize handles mark
 * the edges that belong to this day, unless the event or the root is read-only; continued edges
 * are squared off instead. A short block keeps one handle, and handles take at most a third of the
 * height, so the rest still grabs to move.
 */
export function TimeGridEvent<TEvent>(props: TimeGridEventProps<TEvent>) {
  return (
    <Show
      when={useContext(EventTooltipContext) !== undefined}
      fallback={
        <TimeGridEventTooltip>
          <EventBlock {...props} />
        </TimeGridEventTooltip>
      }
    >
      <EventBlock {...props} />
    </Show>
  );
}

type FocusHandler = (event: FocusEvent) => void;

/** Calls a handler as Solid would: a function, or a bound `[handler, data]` pair. */
function callHandler(handler: unknown, event: FocusEvent) {
  if (typeof handler === "function") (handler as FocusHandler)(event);
  else if (Array.isArray(handler))
    (handler[0] as (data: unknown, event: FocusEvent) => void)(handler[1], event);
}

function EventBlock<TEvent>(props: TimeGridEventProps<TEvent>) {
  const tooltip = useContext(EventTooltipContext);
  const fragment = () => props.layout.fragment;
  const times = createMemo(() => wallTimes(fragment(), props.timeZone));
  const compact = () => isCompact(props.layout.height);
  const handles = () =>
    resizeHandles(
      fragment(),
      compact(),
      props.isReadOnly !== true && fragment().event.isReadOnly !== true,
    );
  const chip = useEventChip(
    () => fragment().event,
    () => ({
      date: fragment().date,
      labelEvent: props.labelEvent,
      offscreen: props.offscreen,
      resourceId: props.resourceId,
    }),
  );
  let title: HTMLSpanElement | undefined;

  const grabbed = () => chip["data-grabbed"] !== undefined;
  // Not while a keyboard gesture moves the event.
  createEffect(grabbed, (isGrabbed) => {
    if (isGrabbed) tooltip?.close();
  });

  const style = (): JSX.CSSProperties => {
    const { height, left, top, width } = props.layout;
    const lane = laneBox(left, width, props.inset);
    return {
      height: percent(height),
      "inset-inline-start": lane.insetInlineStart,
      top: percent(top),
      width: lane.width,
    };
  };

  // One object for the event's life; its getters follow the event.
  const payload: EventTooltipPayload = {
    clipped: () => props.offscreen !== true && !untrack(grabbed) && isClipped(title),
    get label() {
      return chip["aria-label"];
    },
    get title() {
      return fragment().event.title;
    },
  };

  // A title that doesn't fit shows in full in the tooltip while the event is hovered or focused.
  return (
    <TooltipTrigger
      handle={tooltip}
      payload={payload}
      render={(trigger) => {
        const own = trigger as Record<string, unknown>;
        // The trigger's handlers and ref run beside the chip's, which it would otherwise replace.
        const rest = omit(chip, "onFocus", "ref");
        return (
          <EventChip
            {...(merge(own, rest) as Record<string, unknown>)}
            // Given here, the trigger's own slot doesn't replace the event's.
            data-slot="calendar-event"
            color={props.color}
            onFocus={(event: FocusEvent) => {
              callHandler(own.onFocus, event);
              chip.onFocus(event);
            }}
            ref={[own.ref as (element: HTMLElement) => void, chip.ref]}
            class={timeGridEventClass(
              compact(),
              fragment().startsBeforeDay,
              fragment().endsAfterDay,
            )}
            style={style()}
          />
        );
      }}
    >
      <Show
        when={compact()}
        fallback={
          <>
            <span
              ref={(element) => {
                title = element;
              }}
              data-slot="calendar-event-title"
              class={timeGridEventTitleClass}
            >
              <EventIcon>{props.icon}</EventIcon>
              {fragment().event.title}
            </span>
            <span data-event-time="true" class={timeGridEventTimeClass}>
              {eventTimeRange(times()[0], times()[1], props.formats)}
            </span>
          </>
        }
      >
        <span
          ref={(element) => {
            title = element;
          }}
          class={timeGridCompactLineClass}
        >
          <span data-slot="calendar-event-title">
            <EventIcon class={timeGridCompactIconClass}>{props.icon}</EventIcon>
            {fragment().event.title}
          </span>
          <span class={timeGridCompactTimeClass}>
            {compactTimeSeparator}
            <span data-event-time="true">
              {props.formats.time.format(times()[0].toPlainTime())}
            </span>
          </span>
        </span>
      </Show>
      <Show when={handles().start}>
        <span aria-hidden="true" data-resize="start" class={timeGridResizeStartClass} />
      </Show>
      <Show when={handles().end}>
        <span aria-hidden="true" data-resize="end" class={timeGridResizeEndClass} />
      </Show>
    </TooltipTrigger>
  );
}
