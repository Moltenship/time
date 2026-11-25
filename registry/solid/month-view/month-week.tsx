import {
  useCalendarInteraction,
  useClosedDates,
  useRovingFocus,
  type DayGridOverflow,
  type DayGridSegment,
  type EventId,
  type MonthDay,
  type MonthWeek,
  type ResourceId,
} from "@moltenship/calendar-solid";
import type { JSX } from "@solidjs/web";
import { createMemo, For, Show, untrack } from "solid-js";

import type { EventLabeler } from "@registry/calendar/event-label";
import {
  draftCheckClassName,
  previewCheckAttributes,
  useDraftCheck,
} from "@registry/calendar/preview-check";
import { UnavailableTime, type UnavailableTimeRender } from "@registry/calendar/unavailable-time";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import {
  closedDaysOf,
  eventKey,
  fragmentOn,
  inAllDayDraft,
  isBarFragment,
  isBarSegment,
  laneBox,
  segmentsOn,
  segmentsStartingOn,
  type ClosedDay,
} from "@registry/shared/month-view/month-layout";
import {
  dateButtonLabel,
  dateButtonText,
  dayCellLabel,
  dayEventsLabel,
  moreEventsLabel,
  moreEventsText,
  startTime,
  type MonthFormats,
} from "@registry/shared/month-view/month-labels";
import {
  laneProbeClass,
  monthCellDateClass,
  monthClosedClass,
  monthDateButtonClass,
  monthDateLayerClass,
  monthDayCellClass,
  monthListDateClass,
  monthSegmentClass,
  monthWeekClass,
  moreEventsContentClass,
  moreEventsHeaderClass,
  moreEventsItemClass,
  moreEventsListClass,
  moreEventsLongClass,
  moreEventsShortClass,
  moreEventsTriggerClass,
  moreEventsWeekdayClass,
} from "@registry/shared/month-view/month.styles";
import { Popover, PopoverContent, PopoverTrigger } from "@registry/calendar-ui/popover";

import { MonthEvent } from "./month-event";

export {
  DATE_ROW_HEIGHT,
  LANE_HEIGHT,
  laneHeightOf,
  lanesIn,
  weekHeight,
} from "@registry/shared/month-view/month-layout";
export type { MonthFormats } from "@registry/shared/month-view/month-labels";

/**
 * An invisible element one lane tall, for measuring `--calendar-month-lane` in any unit. Observe
 * it with the rows: it resizes when the pointer changes, and the lanes with it.
 */
export function LaneProbe(props: { readonly ref: (element: HTMLDivElement) => void }) {
  return <div ref={props.ref} aria-hidden="true" class={laneProbeClass} />;
}

interface MonthWeekRowProps<TEvent> {
  readonly formats: MonthFormats;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor;
  /** An icon before an event's title, or nothing. */
  readonly getEventIcon?: (event: TEvent) => JSX.Element;
  readonly labelEvent: EventLabeler<TEvent>;
  /** Shows every lane instead of `overflow`, while keyboard focus is on an event it hides. */
  readonly expanded: boolean;
  /** Lanes that fit in a cell, including the one a "+N more" control takes. */
  readonly maxLanes: number;
  /**
   * Rendered beside the visible weeks of a scrolling month, ready to scroll into view: its days
   * and events are not focus targets, so the visible weeks keep the view's tab stop.
   */
  readonly offscreen?: boolean;
  readonly onOpenDay: (date: Temporal.PlainDate) => void;
  /** The week's segments limited to `maxLanes`. */
  readonly overflow: DayGridOverflow<TEvent, EventId, ResourceId>;
  /** Replaces the shading of closed days; see `UnavailableTimeRender`. */
  readonly renderUnavailable?: UnavailableTimeRender;
  readonly week: MonthWeek<TEvent, EventId, ResourceId>;
}

type Segment<TEvent> = DayGridSegment<TEvent, EventId, ResourceId>;

/** A lane's box as Solid's style object. */
function laneStyle(lane: number, span = 1): JSX.CSSProperties {
  const box = laneBox(lane, span);
  return { height: box.height, "inset-inline-end": box.insetInlineEnd, top: box.top };
}

function DateButton(props: {
  readonly class?: string;
  readonly day: MonthDay;
  readonly formats: MonthFormats;
  readonly onOpenDay: (date: Temporal.PlainDate) => void;
  readonly tabindex?: number;
}) {
  return (
    <button
      type="button"
      aria-current={props.day.isToday ? "date" : undefined}
      aria-label={dateButtonLabel(props.formats, props.day.date)}
      onClick={() => props.onOpenDay(props.day.date)}
      tabindex={props.tabindex}
      class={monthDateButtonClass(props.day, props.class)}
    >
      {dateButtonText(props.formats, props.day)}
    </button>
  );
}

/**
 * A day's "+N more" control and a list of all its events, for pointers. Keyboard focus reaches
 * the hidden events in place: their week row shows every lane while focus is on one.
 */
function MoreEvents<TEvent>(props: {
  readonly column: number;
  readonly count: number;
  readonly day: MonthDay;
  readonly formats: MonthFormats;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor;
  /** An icon before an event's title, or nothing. */
  readonly getEventIcon?: (event: TEvent) => JSX.Element;
  readonly labelEvent: EventLabeler<TEvent>;
  readonly lane: number;
  readonly onOpenDay: (date: Temporal.PlainDate) => void;
  readonly segments: readonly Segment<TEvent>[];
}) {
  const text = () => moreEventsText(props.count);
  return (
    <Popover>
      <PopoverTrigger
        aria-label={moreEventsLabel(props.formats, props.day.date, props.count)}
        // The view keeps one tab stop; arrow keys reach these events in the grid.
        tabIndex={-1}
        style={laneStyle(props.lane)}
        class={moreEventsTriggerClass}
      >
        <span class={moreEventsLongClass}>{text().long}</span>
        <span class={moreEventsShortClass}>{text().short}</span>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        aria-label={dayEventsLabel(props.formats, props.day.date)}
        class={moreEventsContentClass}
      >
        <div class={moreEventsHeaderClass}>
          <span class={moreEventsWeekdayClass}>{props.formats.weekday.format(props.day.date)}</span>
          <DateButton
            class={monthListDateClass}
            day={{ ...props.day, inMonth: true }}
            formats={props.formats}
            onOpenDay={props.onOpenDay}
          />
        </div>
        <div class={moreEventsListClass}>
          <For each={segmentsOn(props.segments, props.column)} keyed={eventKey}>
            {(segment) => {
              const fragment = () => fragmentOn(segment(), props.column);
              return (
                <MonthEvent
                  bar={isBarFragment(fragment())}
                  class={moreEventsItemClass}
                  color={props.getEventColor?.(segment().event.event)}
                  icon={props.getEventIcon?.(segment().event.event)}
                  date={props.day.date}
                  endsAfter={fragment().endsAfterDay}
                  event={segment().event}
                  focusTarget={false}
                  labelEvent={props.labelEvent}
                  startsBefore={fragment().startsBeforeDay}
                  time={startTime(fragment(), props.formats)}
                />
              );
            }}
          </For>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * A day of the grid and its keyboard focus target. Its date (`data-date`, which pointer
 * hit-testing reads) sits under the event segments, and shows a keyboard create's range. A day
 * outside the calendar's working hours is muted, and its name says why.
 */
function MonthDayCell(props: {
  readonly children: JSX.Element;
  /** Set when the day has no working hours, with whether the days beside it in the week do. */
  readonly closed: ClosedDay | undefined;
  /** Events on the day, including those behind "+N more". */
  readonly count: number;
  readonly day: MonthDay;
  readonly formats: MonthFormats;
  /** Not a focus target, in a week rendered beside the visible ones. */
  readonly offscreen: boolean;
  readonly onOpenDay: (date: Temporal.PlainDate) => void;
  readonly renderUnavailable?: UnavailableTimeRender;
}) {
  const roving = useRovingFocus(() => ({ date: props.day.date, kind: "day" }));
  const inDraft = useCalendarInteraction((session) => inAllDayDraft(session, props.day.date));
  const draftCheck = useDraftCheck();
  const check = () => previewCheckAttributes(inDraft() ? draftCheck() : undefined);
  // Out of the tab order, yet focusable, so focus on it survives a scroll that moves it away.
  const offscreen = untrack(() => props.offscreen);
  // Native, so it runs before the view's keyboard, which listens on the grid.
  const openDayKey = (element: HTMLElement) => {
    element.addEventListener("keydown", (event) => {
      // Shift+Enter opens the day, as clicking its date does.
      if (event.key === "Enter" && event.shiftKey && event.target === event.currentTarget) {
        event.preventDefault();
        props.onOpenDay(props.day.date);
      }
    });
  };

  return (
    <div
      role="gridcell"
      aria-label={dayCellLabel(props.formats, props.day.date, props.closed, props.count)}
      ref={offscreen ? openDayKey : [roving.ref, openDayKey]}
      onFocus={offscreen ? undefined : roving.onFocus}
      tabindex={offscreen ? -1 : roving.tabindex}
      class={monthDayCellClass}
    >
      <Show when={props.closed}>
        {(closed) => (
          <UnavailableTime
            band={closed()}
            class={monthClosedClass}
            date={props.day.date}
            end={1}
            render={props.renderUnavailable}
            resource={null}
            slot="month-closed"
            start={0}
          />
        )}
      </Show>
      {/* Events sit outside this element, so a drop target is never the cell a bar starts in. */}
      <div
        data-closed={props.closed === undefined ? undefined : ""}
        data-date={props.day.date.toString()}
        data-draft={inDraft() ? "" : undefined}
        data-invalid={check()["data-invalid"]}
        data-warning={check()["data-warning"]}
        class={monthDateLayerClass(
          props.day.inMonth,
          props.closed !== undefined,
          draftCheckClassName,
        )}
      >
        <DateButton
          class={monthCellDateClass}
          day={props.day}
          formats={props.formats}
          onOpenDay={props.onOpenDay}
          tabindex={-1}
        />
      </div>
      {props.children}
    </div>
  );
}

/**
 * One week as a grid row of day cells. A cell holds the event segments that start on it and its
 * "+N more" control; a segment spanning several days stretches over the cells that follow.
 */
export function MonthWeekRow<TEvent>(props: MonthWeekRowProps<TEvent>) {
  const segments = () => (props.expanded ? props.week.segments : props.overflow.segments);
  const closedDates = useClosedDates(() => props.week.range);
  const closed = createMemo(() => closedDaysOf(props.week, closedDates()));

  return (
    <div role="row" class={monthWeekClass}>
      {/* By date: a new projection has new day objects, and a day keeps its element. */}
      <For each={props.week.days} keyed={(day) => day.date.toString()}>
        {(day, column) => (
          <MonthDayCell
            closed={closed()[column()]}
            count={segmentsOn(props.week.segments, column()).length}
            day={day()}
            formats={props.formats}
            offscreen={props.offscreen === true}
            onOpenDay={props.onOpenDay}
            renderUnavailable={props.renderUnavailable}
          >
            {/* By event: a drop moves the event, which keeps its element when it stays put. */}
            <For each={segmentsStartingOn(segments(), column())} keyed={eventKey}>
              {(segment) => (
                <MonthEvent
                  bar={isBarSegment(segment())}
                  class={monthSegmentClass(segment().startsBefore, segment().endsAfter)}
                  color={props.getEventColor?.(segment().event.event)}
                  icon={props.getEventIcon?.(segment().event.event)}
                  date={day().date}
                  days={segment().span}
                  endsAfter={segment().endsAfter}
                  event={segment().event}
                  labelEvent={props.labelEvent}
                  offscreen={props.offscreen}
                  startsBefore={segment().startsBefore}
                  style={laneStyle(segment().lane, segment().span)}
                  time={startTime(segment().fragments[0]!, props.formats)}
                />
              )}
            </For>
            <Show when={!props.expanded && props.overflow.hiddenCounts[column()]! > 0}>
              <MoreEvents
                column={column()}
                count={props.overflow.hiddenCounts[column()]!}
                day={day()}
                formats={props.formats}
                getEventColor={props.getEventColor}
                getEventIcon={props.getEventIcon}
                labelEvent={props.labelEvent}
                lane={props.maxLanes - 1}
                onOpenDay={props.onOpenDay}
                segments={props.week.segments}
              />
            </Show>
          </MonthDayCell>
        )}
      </For>
    </div>
  );
}
