import {
  defineCalendarView,
  getListTitle,
  scrollingListStrategy,
  type CalendarViewRendererProps,
  type EventId,
  type ListProjection,
  type ResourceId,
} from "@moltenship/calendar";
import { useMemo, useSyncExternalStore } from "react";

import { AgendaList, useAgendaList } from "@registry/list-view/agenda-list";
import { agendaRows, rowFrom } from "@registry/list-view/agenda-rows";
import { EmptyAgendaView, type AgendaViewOptions } from "@registry/list-view/agenda-view";

import { useAgendaScroll } from "./use-agenda-scroll";

export interface ScrollingAgendaViewOptions<TEvent> extends AgendaViewOptions<TEvent> {
  /** The registered view a date opens, `"day"` by default. */
  readonly dayView?: string;
}

type ScrollingAgendaViewProps<TEvent> = CalendarViewRendererProps<
  ListProjection<TEvent, EventId, ResourceId>,
  ScrollingAgendaViewOptions<TEvent>
>;

const subscribeToNothing = () => () => {};

/** `true` on the server and while hydrating its markup; `false` once hydrated, or without markup. */
function useHydrating(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => false,
    () => true,
  );
}

function ScrollingAgendaList<TEvent>({
  actions,
  environment,
  loadRange,
  options,
  projection,
  range,
}: ScrollingAgendaViewProps<TEvent>) {
  const loaded = loadRange ?? range;
  const days = projection.days.length;
  // Server markup starts the list at the anchor date, so it's on top before scripts run; the days
  // above join once hydrated, and the virtualizer keeps the anchor's day where it is.
  const hydrating = useHydrating();
  const allRows = useMemo(() => agendaRows(projection.days, loaded), [loaded, projection.days]);
  const skipped = hydrating ? Math.min(rowFrom(allRows, range.start), days) : 0;
  const rows = useMemo(() => allRows.slice(skipped), [allRows, skipped]);
  const list = useAgendaList({ initialRow: rowFrom(rows, range.start), range, rows });
  useAgendaScroll({
    onScroll: (date) => actions.setAnchorDate(date),
    range,
    rows,
    scrollRef: list.scrollRef,
    virtualizer: list.virtualizer,
  });

  return (
    <AgendaList
      aria-label={getListTitle(range, environment)}
      before={skipped}
      days={days}
      describeEvent={options.describeEvent}
      environment={environment}
      getEventColor={options.getEventColor}
      list={list}
      loading={options.loading === true}
      onOpenDay={(date) => {
        actions.setAnchorDate(date);
        actions.setView(options.dayView ?? "day");
      }}
      rows={rows}
    />
  );
}

function ScrollingAgendaView<TEvent>(props: ScrollingAgendaViewProps<TEvent>) {
  return props.projection.days.length > 0 ? (
    <ScrollingAgendaList {...props} />
  ) : (
    <EmptyAgendaView {...props} />
  );
}

/**
 * An agenda named `scrolling-agenda` that scrolls through days without end: the days with events
 * `weeks` either way of the anchor date and a page on, of which only those in view render. The
 * anchor date follows the day on top as the list comes to rest, so the title and the load range
 * follow the scroll; Today, Previous, Next, and picked dates scroll the list to their date. The
 * keys are the agenda's, and moving past the range's ends pages it. Clicking a date opens
 * `dayView`.
 */
export function createScrollingAgendaView<TEvent>(
  defaultOptions: ScrollingAgendaViewOptions<TEvent> = {},
) {
  return defineCalendarView({
    name: "scrolling-agenda",
    defaultOptions,
    strategy: scrollingListStrategy<ScrollingAgendaViewOptions<TEvent>, TEvent>(),
    Renderer: ScrollingAgendaView<TEvent>,
  });
}
