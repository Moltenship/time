import {
  defineCalendarView,
  getMonthRange,
  getMonthTitle,
  limitDayGridLanes,
  monthSpatialNavigation,
  navigateMonth,
  projectMonth,
  useCalendarAnnouncer,
  useCalendarFocus,
  useCalendarPointer,
  type CalendarViewProjectionInput,
  type CalendarViewRendererProps,
  type EventId,
  type MonthProjection,
  type ResourceId,
} from "@moltenship/calendar-solid";
import type { JSX } from "@solidjs/web";
import { createMemo, createSignal, For, onCleanup, onSettled, type Accessor } from "solid-js";

import { useEventLabel, type EventDescriber } from "@registry/calendar/event-label";
import type { UnavailableTimeRender } from "@registry/calendar/unavailable-time";
import { useViewKeyboard } from "@registry/calendar/view-keyboard";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import {
  INITIAL_LANES,
  lanesFor,
  measureLaneSizes,
  observeLaneSizes,
  rowSizes,
  weekHidingFocus,
  type LaneSizes,
} from "@registry/shared/month-view/month-layout";
import { monthFormats, type MonthFormats } from "@registry/shared/month-view/month-labels";
import {
  monthBodyClass,
  monthColumnHeaderClass,
  monthHeaderRowClass,
  monthViewClass,
} from "@registry/shared/month-view/month.styles";

import { LaneProbe, MonthWeekRow } from "./month-week";

export { weekHidingFocus };

export interface MonthViewOptions<TEvent> {
  /**
   * How a pointer drag's preview moves: from slot to slot (`"snapped"`, the default), or with the
   * pointer over a marker of where it would land (`"free"`), snapping there on release. Both
   * propose the same snapped placement.
   */
  readonly dragPreview?: "free" | "snapped";
  /** Extra words for each event's accessible name, such as its calendar. */
  readonly describeEvent?: EventDescriber<TEvent>;
  /** Picks each event's `data-color`; events without one use the theme's default colour. */
  readonly getEventColor?: (event: TEvent) => CalendarEventColor;
  /**
   * A small icon before an event's title, such as a repeat mark on recurring events, or nothing.
   * It's decorative and hidden from assistive technology: say the same in `describeEvent`, which
   * adds to each event's accessible name.
   */
  readonly getEventIcon?: (event: TEvent) => JSX.Element;
  /**
   * Replaces the shading of closed days: a function of its props and of the band, date and
   * resource, such as hatching for holidays.
   */
  readonly renderUnavailable?: UnavailableTimeRender;
}

type MonthViewProps<TEvent> = CalendarViewRendererProps<
  MonthProjection<TEvent, EventId, ResourceId>,
  MonthViewOptions<TEvent>
>;

/**
 * How many event lanes fit in a week row: a memo of the week count and of sizes a ResizeObserver
 * writes, so a month with another number of weeks gets its lanes in the same flush. `probe` is a
 * `LaneProbe`.
 */
function useLaneCapacity(
  body: () => HTMLElement | undefined,
  probe: () => HTMLElement | undefined,
  weekCount: Accessor<number>,
): Accessor<number> {
  const [sizes, setSizes] = createSignal<LaneSizes | null>(null, { ownedWrite: true });
  let stop: (() => void) | undefined;
  onSettled(() => {
    const element = body();
    if (element === undefined) return;
    setSizes(measureLaneSizes(element, probe()));
    stop = observeLaneSizes(element, probe(), setSizes);
  });
  onCleanup(() => stop?.());
  return createMemo(() => {
    const measured = sizes();
    return measured === null
      ? INITIAL_LANES
      : lanesFor(measured.bodyHeight, weekCount(), measured.laneHeight);
  });
}

/** The month grid's formats, new when the locale changes. */
export function useMonthFormats(locale: Accessor<Intl.LocalesArgument>): Accessor<MonthFormats> {
  return createMemo(() => monthFormats(locale()));
}

function MonthView<TEvent>(props: MonthViewProps<TEvent>) {
  let body: HTMLDivElement | undefined;
  let laneProbe: HTMLDivElement | undefined;
  // Pointer drags speak through the same messages as the keyboard.
  const announcer = useCalendarAnnouncer();
  const pointer = useCalendarPointer(() => ({
    announcer,
    check: props.actions.checkEventChange,
    disabled: props.isReadOnly,
    events: props.events,
    onPropose: props.actions.proposeEventChange,
    preview: props.options.dragPreview,
    scrollContainer: {
      get current() {
        return body ?? null;
      },
    },
    timeZone: props.environment.timeZone,
  }));
  const maxLanes = useLaneCapacity(
    () => body,
    () => laneProbe,
    () => props.projection.weeks.length,
  );
  const formats = useMonthFormats(() => props.environment.locale);
  const labelEvent = useEventLabel(
    () => props.environment,
    () => props.options.describeEvent,
  );
  const keyboard = useViewKeyboard();
  const overflows = createMemo(() =>
    props.projection.weeks.map((week) => limitDayGridLanes(week, maxLanes())),
  );
  const expandedWeek = useCalendarFocus((focus) =>
    weekHidingFocus(focus, props.projection.weeks, overflows()),
  );
  const openDay = (date: Temporal.PlainDate) => {
    props.actions.setAnchorDate(date);
    props.actions.setView("day");
  };

  return (
    <div
      ref={[keyboard, pointer]}
      role="grid"
      aria-label={getMonthTitle(props.range, props.environment)}
      data-slot="month-view"
      class={monthViewClass(props.isReadOnly)}
    >
      <LaneProbe
        ref={(element) => {
          laneProbe = element;
        }}
      />
      <div role="row" class={monthHeaderRowClass}>
        <For each={props.projection.weeks[0]?.days ?? []} keyed={(day) => day.date.dayOfWeek}>
          {(day) => (
            <div
              role="columnheader"
              aria-label={formats().weekdayName.format(day().date)}
              class={monthColumnHeaderClass}
            >
              {formats().weekday.format(day().date)}
            </div>
          )}
        </For>
      </div>
      <div
        ref={(element) => {
          body = element;
        }}
        class={monthBodyClass}
        style={{ "grid-template-rows": rowSizes(props.projection.weeks, expandedWeek()) }}
      >
        <For each={props.projection.weeks} keyed={(week) => week.range.start.toString()}>
          {(week, index) => (
            <MonthWeekRow
              expanded={index() === expandedWeek()}
              formats={formats()}
              getEventColor={props.options.getEventColor}
              getEventIcon={props.options.getEventIcon}
              labelEvent={labelEvent()}
              maxLanes={maxLanes()}
              onOpenDay={openDay}
              overflow={overflows()[index()]!}
              renderUnavailable={props.options.renderUnavailable}
              week={week()}
            />
          )}
        </For>
      </div>
    </div>
  );
}

/**
 * A Google Calendar-style month grid named `month`. Clicking a date opens the `day` view on it;
 * dragging an event moves it to another day, and dragging across days creates an all-day event.
 * The grid has one tab stop: arrow keys move between days, Enter enters a day's events, Space
 * grabs an event to move it (Shift+Space to resize) or a day to create an event, and Shift+Enter
 * opens a day. Pass default options here; a root can override them through `viewOptions.month`.
 */
export function createMonthView<TEvent>(defaultOptions: MonthViewOptions<TEvent> = {}) {
  return defineCalendarView({
    name: "month",
    defaultOptions,
    strategy: {
      getRange: getMonthRange,
      getSpatialNavigation: monthSpatialNavigation,
      getTitle: getMonthTitle,
      navigate: navigateMonth,
      project: (input: CalendarViewProjectionInput<MonthViewOptions<TEvent>, TEvent>) =>
        projectMonth(input),
    },
    Renderer: MonthView<TEvent>,
  });
}
