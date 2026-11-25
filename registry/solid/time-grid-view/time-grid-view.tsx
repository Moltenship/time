import {
  defineCalendarView,
  timeGridStrategy,
  timeGridTitle,
  useCalendarAnnouncer,
  useCalendarPointer,
  type CalendarViewRendererProps,
  type OverlapLayoutOptions,
  type TimeGridProjection,
  type TimeGridSpan,
} from "@moltenship/calendar-solid";
import type { JSX } from "@solidjs/web";
import { createMemo, createSignal, Show } from "solid-js";

import { useEventLabel, type EventDescriber } from "@registry/calendar/event-label";
import type { UnavailableTimeRender } from "@registry/calendar/unavailable-time";
import { useViewKeyboard } from "@registry/calendar/view-keyboard";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import { annotationFormats } from "@registry/shared/time-grid-view/annotation-label";
import { fullDateFormat } from "@registry/shared/time-grid-view/time-grid-labels";
import {
  timeGridHeadClass,
  timeGridViewClass,
} from "@registry/shared/time-grid-view/time-grid.styles";

import { TimeGridAllDay } from "./time-grid-all-day";
import {
  createAnnotationHandles,
  DEFAULT_COLUMN_HEIGHT,
  TimeGridAnnotationOverlays,
  useTimeGridAnnotationLayout,
  type TimeGridAnnotationOptions,
  type TimeGridAnnotationWiring,
} from "./time-grid-annotations";
import { TimeGridBody } from "./time-grid-body";
import { TimeGridEventTooltip } from "./time-grid-event";
import { TimeGridHeader } from "./time-grid-header";
import { gutterStyle, useTimeGridZones } from "./time-grid-zones";

/**
 * Overlapping events sit side by side in lanes (`overlapLayout: "columns"`, the default), in lanes
 * of equal width (`"equal"`), or cascade (`"stack"`, indented by `stackIndent`).
 * `getEventOverlapLayout` gives events their own layout, such as their calendar's: a group of
 * overlapping events that all agree takes it, and any other group `overlapLayout`.
 */
export interface TimeGridViewOptions<TEvent> extends OverlapLayoutOptions<TEvent> {
  /**
   * How the root's annotations draw: the rail's size and side, or your own composition of the
   * annotation parts. Without annotation sources on the root, there is no rail.
   */
  readonly annotations?: TimeGridAnnotationOptions;
  /** Registered view a week's header date opens, usually `"day"`; without it dates are static. */
  readonly dayView?: string;
  /** Extra words for each event's accessible name, such as its calendar. */
  readonly describeEvent?: EventDescriber<TEvent>;
  /**
   * How a pointer drag's preview moves: from slot to slot (`"snapped"`, the default), or with the
   * pointer over a marker of where it would land (`"free"`), snapping there on release. Both
   * propose the same snapped placement.
   */
  readonly dragPreview?: "free" | "snapped";
  /** Colour for an event; sets `data-color` on every element that renders it. */
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
  /**
   * A small icon before an event's title, such as a repeat mark on recurring events, or nothing.
   * It's decorative and hidden from assistive technology: say the same in `describeEvent`, which
   * adds to each event's accessible name.
   */
  readonly getEventIcon?: (event: TEvent) => JSX.Element;
  /**
   * Replaces the shading of closed time: a function of its props and of the band, date and
   * resource, such as a gradient into working hours or a tint for rooms.
   */
  readonly renderUnavailable?: UnavailableTimeRender;
}

/** Pointer and keyboard both step by these slots, so they reach the same times. */
const snap = { increment: 15, smallestUnit: "minute" } as const;

export type TimeGridViewProps<TEvent> = CalendarViewRendererProps<
  TimeGridProjection<TEvent>,
  TimeGridViewOptions<TEvent>
>;

/**
 * Day columns under a sticky header and all-day row, with a scrolling 24-hour body. Drag an event
 * to move it (into the all-day row to make it all-day), its edges to resize it, or empty time to
 * create one; changes go to the root's `onEventChange`. From the keyboard the grid is one tab
 * stop: arrow keys move between all-day cells, 15-minute slots, and events, and Space picks up an
 * event (Shift+Space to resize) or starts an event on the focused slot or day.
 */
export function TimeGridView<TEvent>(props: TimeGridViewProps<TEvent>) {
  let body: HTMLDivElement | undefined;
  const days = () => props.projection.days;
  const columns = createMemo(() => days().map(({ column }) => column));
  const zones = useTimeGridZones(() => props.environment, columns);
  // Pointer drags speak through the same messages as the keyboard, and the drag preview labels
  // the proposed range in the calendar's locale.
  const announcer = useCalendarAnnouncer();
  const pointer = useCalendarPointer(() => ({
    announcer,
    check: props.actions.checkEventChange,
    columns: columns(),
    disabled: props.isReadOnly,
    events: props.events,
    onPropose: props.actions.proposeEventChange,
    preview: props.options.dragPreview,
    scrollContainer: {
      get current() {
        return body ?? null;
      },
    },
    snap,
    timeZone: props.environment.timeZone,
  }));
  const keyboard = useViewKeyboard({ snap });
  // Merging and lane packing use drawn sizes, so they follow the body's measured height.
  const [columnHeight, setColumnHeight] = createSignal(DEFAULT_COLUMN_HEIGHT);
  const annotationLayout = useTimeGridAnnotationLayout(
    columns,
    () => props.options.annotations,
    () => ({ columnHeight: columnHeight(), dense: days().length > 1 }),
  );
  const annotationHandles = createAnnotationHandles();
  const formats = createMemo(() =>
    annotationFormats(props.environment.locale, props.environment.timeZone),
  );
  const annotations = createMemo((): TimeGridAnnotationWiring | undefined => {
    const layout = annotationLayout();
    return layout.enabled ? { formats: formats(), handles: annotationHandles, layout } : undefined;
  });
  const labelEvent = useEventLabel(
    () => props.environment,
    () => props.options.describeEvent,
  );
  const formatDate = createMemo(() => fullDateFormat(props.environment.locale));
  const openDay = createMemo(() => {
    const { dayView } = props.options;
    return dayView === undefined || days().length === 1
      ? undefined
      : (date: Temporal.PlainDate) => {
          props.actions.setAnchorDate(date);
          props.actions.setView(dayView);
        };
  });

  return (
    <TimeGridEventTooltip>
      {/* Rows: day headers, all-day events, and the timed day columns; each starts with a gutter cell. */}
      <div
        ref={[keyboard, pointer]}
        role="grid"
        aria-label={timeGridTitle(props.range, props.environment.locale)}
        data-slot="time-grid"
        class={timeGridViewClass(props.isReadOnly)}
        style={gutterStyle(zones())}
      >
        <div class={timeGridHeadClass}>
          <TimeGridHeader
            actions={props.actions}
            annotations={annotations()}
            days={days()}
            dayView={props.options.dayView}
            environment={props.environment}
            zones={zones()}
          />
          <TimeGridAllDay
            days={days()}
            formatDate={formatDate()}
            getEventColor={props.options.getEventColor}
            getEventIcon={props.options.getEventIcon}
            labelEvent={labelEvent()}
            onOpenDay={openDay()}
            row={props.projection.allDay}
          />
        </div>
        <TimeGridBody
          annotations={annotations()}
          days={days()}
          environment={props.environment}
          getEventColor={props.options.getEventColor}
          getEventIcon={props.options.getEventIcon}
          isReadOnly={props.isReadOnly}
          labelEvent={labelEvent()}
          onColumnHeightChange={setColumnHeight}
          onOpenDay={openDay()}
          ref={(element) => {
            body = element;
          }}
          renderUnavailable={props.options.renderUnavailable}
          slotMinutes={snap.increment}
          zones={zones()}
        />
      </div>
      {/* Outside the grid: an open popover's parts must not become grid children. */}
      <Show when={annotations() !== undefined}>
        <TimeGridAnnotationOverlays formatTime={formats().time} handles={annotationHandles} />
      </Show>
    </TimeGridEventTooltip>
  );
}

function timeGridView<const TName extends string, TEvent>(
  name: TName,
  span: TimeGridSpan,
  defaultOptions: TimeGridViewOptions<TEvent>,
) {
  return defineCalendarView({
    defaultOptions,
    name,
    strategy: timeGridStrategy<TimeGridViewOptions<TEvent>, TEvent>(span),
    Renderer: TimeGridView<TEvent>,
  });
}

/** Seven columns starting on the calendar's `weekRules.firstDay`. */
export function createWeekView<TEvent = unknown>(defaultOptions: TimeGridViewOptions<TEvent> = {}) {
  return timeGridView("week", { kind: "week" }, defaultOptions);
}

/** One column for the anchor date. */
export function createDayView<TEvent = unknown>(defaultOptions: TimeGridViewOptions<TEvent> = {}) {
  return timeGridView("day", { count: 1, kind: "days" }, defaultOptions);
}

/**
 * Three columns from the anchor date, named `3-day`: more than a day where a week's seven columns
 * don't fit, as on a phone. Previous and Next move three days.
 */
export function createThreeDayView<TEvent = unknown>(
  defaultOptions: TimeGridViewOptions<TEvent> = {},
) {
  return timeGridView("3-day", { count: 3, kind: "days" }, defaultOptions);
}
