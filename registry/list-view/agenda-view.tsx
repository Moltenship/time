import {
  defineCalendarView,
  getListRange,
  getListTitle,
  listSpatialNavigation,
  navigateList,
  projectList,
  type CalendarViewProjectionInput,
  type CalendarViewRendererProps,
  type EventId,
  type ListProjection,
  type ListViewOptions,
  type ResourceId,
  withAsciiSpaces,
} from "@moltenship/calendar";
import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";

import type { EventDescriber } from "@registry/calendar/event-label";
import { useViewKeyboard } from "@registry/calendar/view-keyboard";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";

import { AgendaList, useAgendaFormats, useAgendaList } from "./agenda-list";
import { agendaRows } from "./agenda-rows";
import { EmptyAgenda } from "./agenda-states";

export interface AgendaViewOptions<TEvent> extends ListViewOptions {
  /** Extra words for each event's accessible name, such as its calendar. */
  readonly describeEvent?: EventDescriber<TEvent>;
  /** Picks each event's `data-color`; events without one use the theme's default colour. */
  readonly getEventColor?: (event: TEvent) => CalendarEventColor;
  /**
   * A small icon before an event's title, such as a repeat mark on recurring events, or nothing.
   * It's decorative and hidden from assistive technology: say the same in `describeEvent`, which
   * adds to each event's accessible name.
   */
  readonly getEventIcon?: (event: TEvent) => ReactNode;
  /**
   * Events for the view's dates are still being fetched: the view says they're loading instead of
   * that nothing is scheduled.
   */
  readonly loading?: boolean;
}

type AgendaViewProps<TEvent> = CalendarViewRendererProps<
  ListProjection<TEvent, EventId, ResourceId>,
  AgendaViewOptions<TEvent>
>;

/**
 * The view's dates without events, or while they load, in place of the list. Still the agenda's
 * one tab stop, so keyboard paging can cross empty weeks.
 */
function EmptyAgendaView<TEvent>({ environment, options, range }: AgendaViewProps<TEvent>) {
  const keyboard = useViewKeyboard();
  const formats = useAgendaFormats(environment.locale);

  return (
    <div
      {...keyboard}
      data-slot="agenda-view"
      className="flex h-full items-center justify-center p-6 text-center"
    >
      <EmptyAgenda
        dates={withAsciiSpaces(
          formats.range.formatRange(range.start, range.end.subtract({ days: 1 })),
        )}
        loading={options.loading === true}
        start={range.start}
      />
    </div>
  );
}

function PagedAgendaList<TEvent>({
  actions,
  environment,
  options,
  projection,
  range,
}: AgendaViewProps<TEvent>) {
  const rows = useMemo(() => agendaRows(projection.days), [projection.days]);
  const list = useAgendaList({ initialRow: 0, range, rows });
  const { virtualizer } = list;

  // Another page of weeks starts at its top.
  const shown = useRef(range);
  useLayoutEffect(() => {
    if (shown.current === range) return;
    shown.current = range;
    virtualizer.scrollToOffset(0);
  }, [range, virtualizer]);

  return (
    <AgendaList
      aria-label={getListTitle(range, environment)}
      days={rows.length}
      describeEvent={options.describeEvent}
      environment={environment}
      getEventColor={options.getEventColor}
      getEventIcon={options.getEventIcon}
      list={list}
      loading={options.loading === true}
      onOpenDay={(date) => {
        actions.setAnchorDate(date);
        actions.setView("day");
      }}
      rows={rows}
    />
  );
}

function AgendaView<TEvent>(props: AgendaViewProps<TEvent>) {
  return props.projection.days.length > 0 ? (
    <PagedAgendaList {...props} />
  ) : (
    <EmptyAgendaView {...props} />
  );
}

/**
 * A chronological agenda named `agenda`: the days that have events, four weeks from the anchor's
 * week unless `weeks` says otherwise. Only the days in view render, so a long range stays fast.
 * Clicking a date opens the `day` view on it. From the keyboard the list is one tab stop: Up and
 * Down move between events, Page Up and Page Down between days, and Shift+Enter opens an event's
 * day.
 */
export function createAgendaView<TEvent>(defaultOptions: AgendaViewOptions<TEvent> = {}) {
  return defineCalendarView({
    name: "agenda",
    defaultOptions,
    strategy: {
      getRange: getListRange,
      getSpatialNavigation: listSpatialNavigation,
      getTitle: getListTitle,
      navigate: navigateList,
      project: (input: CalendarViewProjectionInput<AgendaViewOptions<TEvent>, TEvent>) =>
        projectList(input),
    },
    Renderer: AgendaView<TEvent>,
  });
}
