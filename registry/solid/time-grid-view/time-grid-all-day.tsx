import {
  useCalendarFocus,
  useRovingFocus,
  type DayGridOverflow,
  type DayGridRow,
  type DayGridSegment,
  type EventId,
  type PlainDateInterval,
  type ResourceId,
  type TimeGridDay,
} from "@moltenship/calendar-solid";
import type { JSX } from "@solidjs/web";
import { createMemo, createSignal, For, Show, untrack, type Accessor } from "solid-js";

import { EventChip, EventIcon, useEventChip } from "@registry/calendar/event-chip";
import type { EventLabeler } from "@registry/calendar/event-label";
import { draftCheckClassName } from "@registry/calendar/preview-check";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import {
  allDayCellPlacement,
  allDayLaneBox,
  allDayRowHeight,
  COLLAPSED_LANES,
  collapsedRows,
  covers,
  focusHiddenByCollapse,
  isCollapsible,
  shownLanes,
  type AllDayRow,
} from "@registry/shared/time-grid-view/all-day-layout";
import { dayColumns, eventKey } from "@registry/shared/time-grid-view/time-grid-geometry";
import {
  allDayCellLabel,
  allDayLabel,
  allDayToggleLabel,
  moreAllDayText,
} from "@registry/shared/time-grid-view/time-grid-labels";
import {
  allDayCellClass,
  allDayDropClass,
  allDayEventClass,
  allDayEventTitleClass,
  allDayMoreClass,
  allDayRowClass,
  allDayRowHeaderClass,
  allDayToggleClass,
  allDayToggleIconClass,
  srOnlyClass,
  timeGridDaysClass,
} from "@registry/shared/time-grid-view/time-grid.styles";
import { Button } from "@registry/calendar-ui/button";
import { ChevronDownIcon } from "@registry/calendar-ui/icons";

export type { AllDayRow } from "@registry/shared/time-grid-view/all-day-layout";

export interface TimeGridAllDayProps<TEvent> {
  readonly days: readonly TimeGridDay<TEvent>[];
  /** Full dates, for the cells' accessible names. */
  readonly formatDate: (date: Temporal.PlainDate) => string;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
  /** An icon before an event's title, or nothing. */
  readonly getEventIcon?: (event: TEvent) => JSX.Element;
  readonly labelEvent: EventLabeler<TEvent>;
  readonly row: DayGridRow<TEvent, EventId, ResourceId>;
}

type Segment<TEvent> = DayGridSegment<TEvent, EventId, ResourceId>;
type Overflow<TEvent> = DayGridOverflow<TEvent, EventId, ResourceId>;

/** A lane's box as Solid's style object. */
function laneStyle(lane: number, span = 1, offset = 0): JSX.CSSProperties {
  const box = allDayLaneBox(lane, span, offset);
  return {
    height: box.height,
    "inset-inline-end": box.insetInlineEnd,
    "inset-inline-start": box.insetInlineStart,
    top: box.top,
  };
}

/** A date's all-day cell and keyboard focus target. */
function AllDayCell(props: {
  readonly children: JSX.Element;
  readonly colIndex?: number;
  readonly count: number;
  readonly date: Temporal.PlainDate;
  readonly formatDate: (date: Temporal.PlainDate) => string;
  /**
   * Rendered beside the visible dates of a scrolling grid: hidden from assistive technology and
   * not a focus target, so the visible dates keep the grid's tab stop.
   */
  readonly offscreen: boolean;
  readonly resourceId?: ResourceId | null;
}) {
  const roving = useRovingFocus(() => ({
    date: props.date,
    kind: "day",
    resourceId: props.resourceId,
  }));
  // Out of the tab order, yet focusable, so focus on it survives a scroll that moves it away.
  const offscreen = untrack(() => props.offscreen);

  return (
    <div
      role="gridcell"
      aria-colindex={props.colIndex}
      aria-hidden={props.offscreen ? "true" : undefined}
      aria-label={allDayCellLabel(props.formatDate(props.date), props.count)}
      ref={offscreen ? undefined : roving.ref}
      onFocus={offscreen ? undefined : roving.onFocus}
      tabindex={offscreen ? -1 : roving.tabindex}
      class={allDayCellClass}
    >
      {/* Events sit outside this element, so a drop target is never the cell a bar starts in. */}
      <div
        data-all-day=""
        data-date={props.date.toString()}
        class={allDayDropClass(draftCheckClassName)}
      />
      {props.children}
    </div>
  );
}

function AllDayEvent<TEvent>(props: {
  /**
   * The first date it is a focus target on: the date of the cell it renders in, so keys move on
   * from what is visible.
   */
  readonly date: Temporal.PlainDate;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
  readonly getEventIcon?: (event: TEvent) => JSX.Element;
  readonly labelEvent: EventLabeler<TEvent>;
  /** Cells between the segment's first day and the cell it renders in. */
  readonly offset: number;
  /** All of it is beside the visible dates of a scrolling grid: not a focus target. */
  readonly offscreen: boolean;
  readonly resourceId?: ResourceId | null;
  readonly segment: Segment<TEvent>;
}) {
  const chip = useEventChip(
    () => props.segment.event,
    () => ({
      date: props.date,
      days: props.segment.span - props.offset,
      labelEvent: props.labelEvent,
      offscreen: props.offscreen,
      resourceId: props.resourceId,
    }),
  );

  return (
    <EventChip
      color={props.getEventColor?.(props.segment.event.event)}
      {...chip}
      class={allDayEventClass(props.segment.startsBefore, props.segment.endsAfter)}
      style={laneStyle(props.segment.lane, props.segment.span, props.offset)}
    >
      <span data-slot="calendar-event-title" class={allDayEventTitleClass}>
        <EventIcon>{props.getEventIcon?.(props.segment.event.event)}</EventIcon>
        {props.segment.event.title}
      </span>
    </EventChip>
  );
}

export interface AllDayCollapse<TEvent> {
  /** Whether busy days show three lanes and "+N more". */
  readonly collapsed: boolean;
  /** Whether any day has more than three lanes. */
  readonly collapsible: boolean;
  readonly expand: () => void;
  /** The rows' height, as CSS. */
  readonly height: string;
  /** Each row's three-lane version while collapsed, else `null`, in the order of the rows. */
  readonly overflows: readonly (Overflow<TEvent> | null)[];
  readonly toggle: () => void;
}

/**
 * All-day rows collapse together to three lanes until expanded, and take the height of the
 * busiest one. Keyboard focus on an event a collapsed row hides expands them. Its fields are
 * getters, so they follow `days` and `rows`.
 */
export function useAllDayCollapse<TEvent>(
  days: Accessor<readonly TimeGridDay<TEvent>[]>,
  rows: Accessor<readonly AllDayRow<TEvent>[]>,
): AllDayCollapse<TEvent> {
  const [expanded, setExpanded] = createSignal(false, { ownedWrite: true });
  const limited = createMemo(() => collapsedRows(rows()));
  const collapsible = createMemo(() => isCollapsible(limited()));
  const focusHidden = useCalendarFocus((focus) =>
    focusHiddenByCollapse(focus, days(), rows(), limited()),
  );
  const collapsed = createMemo(() => collapsible() && !expanded() && !focusHidden());

  return {
    get collapsed() {
      return collapsed();
    },
    get collapsible() {
      return collapsible();
    },
    expand: () => setExpanded(true),
    get height() {
      return allDayRowHeight(shownLanes(rows(), collapsed()));
    },
    get overflows() {
      return collapsed() ? limited() : rows().map(() => null);
    },
    toggle: () => setExpanded(untrack(collapsed)),
  };
}

/** The all-day row's header, with the chevron that shows or hides busy days' extra lanes. */
export function AllDayRowHeader(props: { readonly collapse: AllDayCollapse<unknown> }) {
  return (
    <div role="rowheader" class={allDayRowHeaderClass}>
      <span class={srOnlyClass}>{allDayLabel}</span>
      <Show when={props.collapse.collapsible}>
        <Button
          aria-expanded={props.collapse.collapsed ? "false" : "true"}
          aria-label={allDayToggleLabel(props.collapse.collapsed)}
          class={allDayToggleClass}
          onClick={() => props.collapse.toggle()}
          size="icon-sm"
          // The grid keeps one tab stop; arrow keys reach hidden events and expand the row.
          tabindex={-1}
          variant="ghost"
        >
          <ChevronDownIcon
            aria-hidden="true"
            class={allDayToggleIconClass(props.collapse.collapsed)}
          />
        </Button>
      </Show>
    </div>
  );
}

export interface TimeGridAllDayCellsProps<TEvent> extends TimeGridAllDayProps<TEvent> {
  /** The first cell's `aria-colindex`, in a grid that renders only some of its columns. */
  readonly colIndex?: number;
  /** Shows the rest of a collapsed row. */
  readonly onExpand: () => void;
  /** The row's three-lane version while collapsed, from `useAllDayCollapse`. */
  readonly overflow: Overflow<TEvent> | null;
  /** The row's resource, in a view with a row per resource. */
  readonly resourceId?: ResourceId | null;
  /**
   * The dates on screen, when the grid renders days around them while it scrolls; the others are
   * hidden from assistive technology. All of `days` by default.
   */
  readonly shown?: PlainDateInterval;
}

/**
 * One all-day row's cells: a day's cell holds the segments that start on it, and a span stretches
 * over the cells that follow.
 */
export function TimeGridAllDayCells<TEvent>(props: TimeGridAllDayCellsProps<TEvent>) {
  const segments = () => props.overflow?.segments ?? props.row.segments;
  const placement = createMemo(() => allDayCellPlacement(props.days, props.shown));

  return (
    <div
      class={timeGridDaysClass}
      style={{ "grid-template-columns": dayColumns(props.days.length) }}
    >
      <For each={props.days} keyed={(day) => day.column.key}>
        {(day, column) => {
          const date = () => day().column.date;
          const offscreen = () => !placement().isShown(column());
          const hidden = () => props.overflow?.hiddenCounts[column()] ?? 0;
          return (
            <AllDayCell
              colIndex={props.colIndex === undefined ? undefined : props.colIndex + column()}
              count={props.row.segments.filter((segment) => covers(segment, column())).length}
              date={date()}
              formatDate={props.formatDate}
              offscreen={offscreen()}
              resourceId={props.resourceId}
            >
              <For
                each={segments().filter((segment) => placement().hostOf(segment) === column())}
                keyed={(segment: Segment<TEvent>) => eventKey(segment.event.id)}
              >
                {(segment) => (
                  <AllDayEvent
                    date={date()}
                    getEventColor={props.getEventColor}
                    getEventIcon={props.getEventIcon}
                    labelEvent={props.labelEvent}
                    offset={column() - segment().column}
                    offscreen={offscreen()}
                    resourceId={props.resourceId}
                    segment={segment()}
                  />
                )}
              </For>
              <Show when={hidden() > 0}>
                <button
                  class={allDayMoreClass}
                  onClick={() => props.onExpand()}
                  style={laneStyle(COLLAPSED_LANES - 1)}
                  tabindex={-1}
                  type="button"
                >
                  {moreAllDayText(hidden())}
                </button>
              </Show>
            </AllDayCell>
          );
        }}
      </For>
    </div>
  );
}

/**
 * The grid's all-day row: all-day and multi-day events above the timed columns, collapsing to
 * three lanes until expanded.
 */
export function TimeGridAllDay<TEvent>(props: TimeGridAllDayProps<TEvent>) {
  const rows = createMemo(() => [{ row: props.row }]);
  const collapse = useAllDayCollapse(() => props.days, rows);

  return (
    <div role="row" class={allDayRowClass} style={{ height: collapse.height }}>
      <AllDayRowHeader collapse={collapse} />
      <TimeGridAllDayCells
        days={props.days}
        formatDate={props.formatDate}
        getEventColor={props.getEventColor}
        getEventIcon={props.getEventIcon}
        labelEvent={props.labelEvent}
        onExpand={collapse.expand}
        overflow={collapse.overflows[0]!}
        row={props.row}
      />
    </div>
  );
}
