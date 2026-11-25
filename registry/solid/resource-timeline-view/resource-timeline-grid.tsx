import {
  timelinePosition,
  useCalendarFocus,
  useNow,
  type CalendarCellFocus,
  type CalendarEnvironmentBase,
  type PlainDateInterval,
  type ResourceTimelineProjection,
} from "@moltenship/calendar-solid";
import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, For, Show, untrack } from "solid-js";

import type { EventLabeler } from "@registry/calendar/event-label";
import type { ResourceStatusOptions } from "@registry/calendar/resource-status";
import type { UnavailableTimeRender } from "@registry/calendar/unavailable-time";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import {
  timelineCanvasClass,
  timelineGridClass,
  timelineNowClass,
  timelineViewportClass,
} from "@registry/shared/resource-timeline-view/resource-timeline.styles";
import { cellTargets } from "@registry/shared/resource-timeline-view/timeline-focus";
import {
  timelineLabels,
  timelineTimeFormat,
} from "@registry/shared/resource-timeline-view/timeline-labels";
import {
  boxStyle,
  HEADER_HEIGHT,
  MIN_SLOT_WIDTH,
  nowLineBox,
  openingOffset,
  rowHeight,
} from "@registry/shared/resource-timeline-view/timeline-placement";
import {
  timelineSlotGroups,
  timelineSlots,
} from "@registry/shared/resource-timeline-view/timeline-scale";

import { ResourceTimelineHeader } from "./resource-timeline-header";
import { ResourceTimelineRow } from "./resource-timeline-row";
import { useTimelineVirtualizer } from "./use-timeline-virtualizer";

export interface ResourceTimelineGridProps<TEvent> {
  /** Where the calendar enters the grid; its cell renders wherever the grid scrolls. */
  readonly entry: CalendarCellFocus | null;
  readonly environment: CalendarEnvironmentBase;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
  /** An icon before an event's title, or nothing. */
  readonly getEventIcon?: (event: TEvent) => JSX.Element;
  /** The root takes no changes: events have no resize handles. */
  readonly isReadOnly?: boolean;
  /** The grid's accessible name, such as the visible range. */
  readonly label: string;
  readonly labelEvent: EventLabeler<TEvent>;
  readonly projection: ResourceTimelineProjection<TEvent>;
  readonly range: PlainDateInterval;
  /** The grid element, for the pointer layer and the view's keyboard; the grid is its tab stop. */
  readonly ref: (element: HTMLDivElement) => void;
  readonly renderUnavailable?: UnavailableTimeRender;
  /** Whether row headers show each resource's status. */
  readonly resourceStatus: ResourceStatusOptions | null;
  /** Length of a keyboard step in an hour timeline, in minutes. */
  readonly snapMinutes: number;
}

const noCells: readonly CalendarCellFocus[] = [];

/**
 * Resources as rows and time as columns in one scrolling viewport. The header and the resource
 * column are sticky, and only the rows and slots in view render, so 500 resources over a month
 * stay as light as a dozen. Rows grow to fit their lanes, keyboard focus scrolls into view, and
 * the time axis runs in the calendar's direction.
 */
export function ResourceTimelineGrid<TEvent>(props: ResourceTimelineGridProps<TEvent>) {
  let viewport: HTMLDivElement | undefined;
  // Rows, slots and cells read these memos, not the view's projection, so a draft that changes
  // only the events re-runs the few computations that read them, not every cell.
  const columns = createMemo(() => props.projection.columns);
  const environment = createMemo(() => props.environment);
  // The view hands over a new range object with each projection; the dates are what count.
  const range = createMemo(() => props.range, {
    equals: (previous, next) => previous.start.equals(next.start) && previous.end.equals(next.end),
  });
  const rows = createMemo(() => props.projection.rows);
  const today = createMemo(() => props.projection.today);
  const unit = createMemo(() => props.projection.unit);
  const slots = createMemo(() => timelineSlots(range(), unit()));
  const groups = createMemo(() => timelineSlotGroups(slots(), unit()));
  const labels = createMemo(() => timelineLabels(props.environment.locale, unit()));
  const formatTime = createMemo(() =>
    timelineTimeFormat(props.environment.locale, props.environment.timeZone),
  );
  // New functions only when the rows or slots change, so the axes re-read them only then.
  const rowAccess = createMemo(() => {
    const rows = props.projection.rows;
    return {
      height: (index: number) => rowHeight(rows[index]!),
      key: (index: number) => rows[index]!.resource.key,
    };
  });
  const slotKey = createMemo(() => {
    const current = slots();
    return (index: number) => current[index]!.key;
  });
  // The entry and the focused row and slot always render, so there is always a tab stop, roving
  // focus finds its element at once, and the browser scrolls it into view clear of the sticky
  // header and column (`scroll-padding`).
  const focus = useCalendarFocus((current) => current);
  const targets = createMemo(() => cellTargets(focus(), props.entry, props.projection, range()));
  const timeline = useTimelineVirtualizer(
    () => ({
      direction: props.environment.direction,
      headerHeight: HEADER_HEIGHT,
      rows: {
        count: props.projection.rows.length,
        height: rowAccess().height,
        key: rowAccess().key,
        pinned: targets().rows,
      },
      slots: {
        count: slots().length,
        key: slotKey(),
        minWidth: MIN_SLOT_WIDTH[unit()],
        pinned: targets().slots,
      },
    }),
    () => viewport,
  );

  // An hour timeline opens on the current time once the first clock sample arrives (after
  // hydration, `now` starts as null) and the axes have the viewport, or on 08:00 when today isn't
  // shown. Later ticks and navigation keep the scroll position.
  const now = useNow();
  const nowAt = createMemo(() => {
    const instant = now();
    return instant === null ? null : timelinePosition(props.projection.columns, instant);
  });
  let opened = false;
  createEffect(
    () => ({ at: nowAt(), ready: timeline.mounted() && now() !== null && unit() === "hour" }),
    ({ at, ready }) => {
      if (opened || !ready) return;
      opened = true;
      untrack(() =>
        timeline.timeAxis.scrollToOffset(
          openingOffset(
            at,
            props.projection.columns.length,
            slots().length,
            timeline.slotWidth(),
            viewport?.clientWidth ?? 0,
          ),
        ),
      );
      viewport?.dispatchEvent(new Event("scroll"));
    },
  );

  return (
    <div
      ref={props.ref}
      role="grid"
      aria-colcount={slots().length + 1}
      aria-label={props.label}
      aria-rowcount={props.projection.rows.length + 1}
      data-slot="resource-timeline"
      dir={props.environment.direction}
      class={timelineGridClass(props.isReadOnly)}
      style={{
        "--calendar-resource-column": `${timeline.columnWidth()}px`,
        "--calendar-timeline-header": `${HEADER_HEIGHT}px`,
      }}
    >
      <div
        ref={(element) => {
          viewport = element;
        }}
        data-slot="resource-timeline-viewport"
        class={timelineViewportClass}
      >
        <div
          class={timelineCanvasClass}
          style={boxStyle({ height: timeline.height(), width: timeline.width() })}
        >
          <ResourceTimelineHeader
            groups={groups()}
            labels={labels()}
            slotWidth={timeline.slotWidth()}
            slots={slots()}
            today={today()}
            unit={unit()}
            visibleSlots={timeline.slots()}
          />
          <For each={timeline.rows()} keyed={(item) => item.key}>
            {(virtualRow) => (
              <ResourceTimelineRow
                cells={targets().cells.get(virtualRow().index) ?? noCells}
                columns={columns()}
                environment={environment()}
                formatTime={formatTime()}
                getEventColor={props.getEventColor}
                getEventIcon={props.getEventIcon}
                isReadOnly={props.isReadOnly}
                labelEvent={props.labelEvent}
                labels={labels()}
                range={range()}
                renderUnavailable={props.renderUnavailable}
                resourceStatus={props.resourceStatus}
                row={rows()[virtualRow().index]!}
                slotWidth={timeline.slotWidth()}
                slots={slots()}
                snapMinutes={props.snapMinutes}
                unit={unit()}
                virtualRow={virtualRow()}
                visibleSlots={timeline.slots()}
                weekend={environment().weekRules.weekend}
              />
            )}
          </For>
          <Show when={nowAt() !== null}>
            <div
              aria-hidden="true"
              data-slot="resource-timeline-now"
              class={timelineNowClass}
              style={boxStyle(
                nowLineBox(
                  nowAt()!,
                  timeline.height(),
                  timeline.columnWidth(),
                  slots().length,
                  timeline.slotWidth(),
                ),
              )}
            />
          </Show>
        </div>
      </div>
    </div>
  );
}
