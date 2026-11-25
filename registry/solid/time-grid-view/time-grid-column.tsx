import {
  sameFocus,
  showsInResource,
  useCalendarFocus,
  useCalendarInteraction,
  useRovingFocus,
  type CalendarResource,
  type CalendarSlotFocus,
  type EventDayFragment,
  type EventId,
  type ResourceId,
  type TimeGridDay,
  type TimeGridEventLayout,
} from "@moltenship/calendar-solid";
import type { JSX } from "@solidjs/web";
import { createMemo, For, Show, untrack, type Accessor } from "solid-js";
import { Dynamic } from "@solidjs/web";

import type { EventLabeler } from "@registry/calendar/event-label";
import {
  draftCheckClassName,
  previewCheckAttributes,
  useDraftCheck,
} from "@registry/calendar/preview-check";
import type { UnavailableTimeRender } from "@registry/calendar/unavailable-time";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import {
  bandBox,
  draftBox,
  eventKey,
  inResource,
  percent,
  sameBand,
  slotBand,
} from "@registry/shared/time-grid-view/time-grid-geometry";
import {
  clockChangeTitles,
  outsideWorkingHours,
  slotLabel,
  timeGridColumnFormats,
  type TimeGridColumnFormats,
} from "@registry/shared/time-grid-view/time-grid-labels";
import {
  timeGridColumnClass,
  timeGridDraftClass,
  timeGridEventsClass,
  timeGridFoldClass,
  timeGridGapClass,
  timeGridNowClass,
  timeGridSlotClass,
} from "@registry/shared/time-grid-view/time-grid.styles";

import { describeAnnotationsAt } from "@registry/shared/time-grid-view/annotation-label";

import {
  annotationEventInset,
  bandBesideMarks,
  eventsBesideMarks,
  TimeGridAnnotationProvider,
  TimeGridAnnotations,
  type TimeGridAnnotationMarkData,
  type TimeGridAnnotationWiring,
} from "./time-grid-annotations";
import {
  isUnavailableIn,
  TimeGridAvailability,
  useColumnAvailability,
} from "./time-grid-availability";
import { TimeGridEvent } from "./time-grid-event";
import { describeZoneTimes, type TimeGridZone } from "./time-grid-zones";

export { inResource } from "@registry/shared/time-grid-view/time-grid-geometry";
export type { TimeGridColumnFormats } from "@registry/shared/time-grid-view/time-grid-labels";

/** The formats a column reads, made once per locale for all of a grid's columns. */
export function useTimeGridColumnFormats(
  locale: Accessor<Intl.LocalesArgument>,
): Accessor<TimeGridColumnFormats> {
  return createMemo(() => timeGridColumnFormats(locale()));
}

/** The resource a column shows, in a view with a column per resource. */
export interface TimeGridColumnResource {
  /** `null` for the unassigned bucket. */
  readonly id: ResourceId | null;
  /** `null` for the unassigned bucket. */
  readonly resource: CalendarResource<unknown, ResourceId> | null;
  /** Added to the accessible names of the column's slots and events. */
  readonly title: string;
}

export interface TimeGridColumnProps<TEvent> {
  /** The root's annotations on this column's day, beside its events. */
  readonly annotations?: TimeGridAnnotationWiring & {
    readonly marks: readonly TimeGridAnnotationMarkData[];
  };
  /** The column's `aria-colindex`, in a grid that renders only some of its columns. */
  readonly colIndex?: number;
  readonly day: TimeGridDay<TEvent>;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
  /** An icon before an event's title, or nothing. */
  readonly getEventIcon?: (event: TEvent) => JSX.Element;
  /** The root takes no changes: events have no resize handles. */
  readonly isReadOnly?: boolean;
  readonly labelEvent: EventLabeler<TEvent>;
  /** Position of the now-line when the current time falls in this column. */
  readonly nowTop: number | null;
  readonly formats: TimeGridColumnFormats;
  /** Rendered beside the visible dates of a scrolling grid, so hidden from assistive technology. */
  readonly offscreen?: boolean;
  /** Opens a date in the day view; Shift+Enter on a slot does so. */
  readonly onOpenDay?: (date: Temporal.PlainDate) => void;
  /** The column's resource; without one, the column shows every resource's focus and drafts. */
  readonly resource?: TimeGridColumnResource;
  /** Replaces the shading of closed time; see `UnavailableTimeRender`. */
  readonly renderUnavailable?: UnavailableTimeRender;
  /** Length of a keyboard slot, as the keyboard's snap sets it. */
  readonly slotMinutes: number;
  readonly timeZone: string;
  /** The root's secondary time zones; a focused slot names its time in each. */
  readonly zones?: readonly TimeGridZone[];
}

type Layout<TEvent> = TimeGridEventLayout<EventDayFragment<TEvent, EventId, ResourceId>>;

/**
 * The keyboard's cursor on a slot of this column, rendered only while a slot has focus. Space
 * starts a create there and Enter moves into the events covering it.
 */
function TimeGridSlot(props: {
  readonly focus: CalendarSlotFocus;
  readonly label: string;
  /** In a column scrolled away: out of the tab order, yet still holding focus it has. */
  readonly offscreen: boolean;
  readonly onOpenDay?: (date: Temporal.PlainDate) => void;
  readonly slotMinutes: number;
}) {
  const roving = useRovingFocus(() => props.focus);
  const offscreen = untrack(() => props.offscreen);
  // Native, so it runs before the view's keyboard, which listens on the grid.
  const openDayKey = (element: HTMLElement) => {
    element.addEventListener("keydown", (event) => {
      // Shift+Enter opens the day, as clicking its header date does.
      if (props.onOpenDay !== undefined && event.key === "Enter" && event.shiftKey) {
        event.preventDefault();
        props.onOpenDay(props.focus.date);
      }
    });
  };

  return (
    <div
      role="button"
      aria-label={props.label}
      ref={offscreen ? openDayKey : [roving.ref, openDayKey]}
      onFocus={offscreen ? undefined : roving.onFocus}
      tabindex={offscreen ? -1 : roving.tabindex}
      class={timeGridSlotClass}
      style={bandBox(slotBand(props.focus, props.slotMinutes))}
    />
  );
}

/**
 * One day's 24 hours, a cell of the grid's timed row. `data-date` marks the full-height column for
 * pointer hit-testing; spring forward hours are hatched and repeated fall-back hours tinted.
 */
export function TimeGridColumn<TEvent>(props: TimeGridColumnProps<TEvent>) {
  const column = () => props.day.column;
  const resourceId = () => props.resource?.id;
  const slot = useCalendarFocus(
    (focus) =>
      focus?.kind === "slot" && focus.date.equals(column().date) && inResource(focus, resourceId())
        ? focus
        : null,
    { isEqual: sameFocus },
  );
  const draft = useCalendarInteraction(
    (session) => {
      const id = resourceId();
      return session?.eventId === null &&
        (id === undefined || showsInResource(session.proposed.resourceIds, id))
        ? draftBox(column(), session.proposed)
        : null;
    },
    { isEqual: sameBand },
  );
  const draftCheck = useDraftCheck();
  const unavailable = useColumnAvailability(column, resourceId);
  const inset = createMemo(() => {
    const layout = props.annotations?.layout;
    return layout === undefined ? undefined : annotationEventInset(layout);
  });
  const besideMarks = createMemo(() => {
    const { annotations } = props;
    return annotations === undefined || inset() === undefined
      ? undefined
      : eventsBesideMarks(annotations.layout, annotations.marks, props.day.events);
  });
  /** The draft's box, moved aside for the rail when it crosses a mark. */
  const draftStyle = (band: { readonly height: number; readonly top: number }) => {
    const { annotations } = props;
    const aside = inset();
    return aside !== undefined &&
      annotations !== undefined &&
      bandBesideMarks(annotations.layout, annotations.marks, band)
      ? {
          ...bandBox(band),
          "inset-inline-end": `${aside.end}px`,
          "inset-inline-start": `${aside.start}px`,
        }
      : bandBox(band);
  };
  // The column's own resource, so a gesture started here stays in it.
  const slotFocus = createMemo((): CalendarSlotFocus | null => {
    const focus = slot();
    const id = resourceId();
    return focus === null || id === undefined ? focus : { ...focus, resourceId: id };
  });
  const slotName = (focus: CalendarSlotFocus) =>
    slotLabel([
      props.resource?.title,
      props.formats.slot.format(focus.date.toPlainDateTime(focus.time)),
      props.zones === undefined
        ? undefined
        : describeZoneTimes(column(), focus.time, props.zones, props.formats),
      isUnavailableIn(unavailable(), slotBand(focus, props.slotMinutes))
        ? outsideWorkingHours
        : undefined,
      props.annotations === undefined
        ? undefined
        : describeAnnotationsAt(
            props.annotations.marks,
            column(),
            slotBand(focus, props.slotMinutes),
            props.annotations.formats,
          ),
    ]);
  const labelHere = createMemo<EventLabeler<TEvent>>(() => {
    const { labelEvent, resource } = props;
    return resource === undefined ? labelEvent : (event) => labelEvent(event, resource.title);
  });

  return (
    <div
      role="gridcell"
      aria-colindex={props.colIndex}
      aria-hidden={props.offscreen === true ? "true" : undefined}
      data-date={column().date.toString()}
      data-today={props.day.isToday ? "" : undefined}
      class={timeGridColumnClass}
    >
      <TimeGridAvailability
        bands={unavailable()}
        date={column().date}
        render={props.renderUnavailable}
        resource={props.resource?.resource ?? null}
      />
      <For each={column().gaps} keyed={(band) => band.top}>
        {(band) => (
          <div class={timeGridGapClass} style={bandBox(band())} title={clockChangeTitles.gap} />
        )}
      </For>
      <For each={column().folds} keyed={(band) => band.top}>
        {(band) => (
          <div class={timeGridFoldClass} style={bandBox(band())} title={clockChangeTitles.fold} />
        )}
      </For>
      <Show when={props.annotations}>
        {(annotations) => (
          <TimeGridAnnotationProvider handles={annotations().handles} layout={annotations().layout}>
            <Dynamic
              component={annotations().layout.options.Annotations ?? TimeGridAnnotations}
              marks={annotations().marks}
            />
          </TimeGridAnnotationProvider>
        )}
      </Show>
      {/* The inline-end margin keeps a strip free for creating an event beside busy blocks. The
          rail takes its strip only from the events beside its marks. */}
      <div class={timeGridEventsClass}>
        <For
          each={props.day.events}
          keyed={(layout: Layout<TEvent>) => eventKey(layout.fragment.event.id)}
        >
          {(layout, index) => (
            <TimeGridEvent
              color={props.getEventColor?.(layout().fragment.event.event)}
              icon={props.getEventIcon?.(layout().fragment.event.event)}
              inset={besideMarks()?.[index()] === true ? inset() : undefined}
              isReadOnly={props.isReadOnly}
              labelEvent={labelHere()}
              layout={layout()}
              formats={props.formats}
              offscreen={props.offscreen}
              resourceId={props.resource?.id}
              timeZone={props.timeZone}
            />
          )}
        </For>
        <Show when={draft()}>
          {(band) => (
            <div
              aria-hidden="true"
              data-slot="time-grid-draft"
              data-invalid={previewCheckAttributes(draftCheck())["data-invalid"]}
              data-warning={previewCheckAttributes(draftCheck())["data-warning"]}
              class={timeGridDraftClass(draftCheckClassName)}
              style={draftStyle(band())}
            />
          )}
        </Show>
      </div>
      <Show when={slotFocus()}>
        {(focus) => (
          <TimeGridSlot
            focus={focus()}
            label={slotName(focus())}
            offscreen={props.offscreen ?? false}
            onOpenDay={props.onOpenDay}
            slotMinutes={props.slotMinutes}
          />
        )}
      </Show>
      <Show when={props.nowTop !== null}>
        <div
          aria-hidden="true"
          data-slot="time-grid-now"
          class={timeGridNowClass}
          style={{ top: percent(props.nowTop!) }}
        />
      </Show>
    </div>
  );
}
