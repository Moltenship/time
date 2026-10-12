import {
  defineCalendarView,
  getListTitle,
  scrollingListStrategy,
  type CalendarViewRendererProps,
  type EventId,
  type ListProjection,
  type ResourceId,
  withAsciiSpaces,
} from "@moltenship/calendar";
import { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";

import { AgendaList, useAgendaFormats, useAgendaList } from "@registry/list-view/agenda-list";
import { agendaRows, rowFrom } from "@registry/list-view/agenda-rows";
import { AgendaEndMessage, EmptyAgenda } from "@registry/list-view/agenda-states";
import type { AgendaViewOptions } from "@registry/list-view/agenda-view";

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

/**
 * The days with events in the loaded dates, then the end of the list. When the dates shown have
 * none, the empty state stands in for them, at the end or among the days after them; past the end
 * of the list, scrolling on moves through the weeks without events.
 */
function ScrollingAgendaView<TEvent>({
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
  const allRows = useMemo(
    () => agendaRows(projection.days, { loaded, shown: range }),
    [loaded, projection.days, range],
  );
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
  const formats = useAgendaFormats(environment.locale);
  const loading = options.loading === true;
  const endRow = rows.at(-1);
  const empty = rows.some((row) => row.kind === "empty" || (row.kind === "end" && row.shown));
  const emptyState = (
    <div className="flex flex-1 items-center justify-center p-6 text-center">
      <EmptyAgenda
        dates={withAsciiSpaces(
          formats.range.formatRange(range.start, range.end.subtract({ days: 1 })),
        )}
        loading={loading}
        start={range.start}
      />
    </div>
  );

  // The empty state had focus when the dates shown got days, which takes it away: focus moves on
  // to their first event, where Tab lands, instead of falling to the page.
  const wasEmpty = useRef(empty);
  useLayoutEffect(() => {
    const filled = wasEmpty.current && !empty;
    wasEmpty.current = empty;
    const page = list.scrollRef.current?.ownerDocument;
    if (!filled || !list.focusWithin.within || page?.activeElement !== page?.body) return;
    const row = rows[rowFrom(rows, range.start)];
    const item = row?.kind === "day" ? row.day.items[0] : undefined;
    if (row?.kind === "day" && item !== undefined) {
      actions.setFocus({ date: row.day.date, eventId: item.event.id, kind: "event" });
    }
  });

  return (
    <AgendaList
      aria-label={getListTitle(range, environment)}
      before={skipped}
      days={days}
      describeEvent={options.describeEvent}
      environment={environment}
      getEventColor={options.getEventColor}
      getEventIcon={options.getEventIcon}
      empty={emptyState}
      end={
        endRow?.kind === "end" && endRow.shown ? (
          emptyState
        ) : (
          <AgendaEndMessage
            empty={endRow?.kind === "end" ? endRow.empty : null}
            formats={formats}
            loading={loading}
          />
        )
      }
      list={list}
      loading={loading}
      onOpenDay={(date) => {
        actions.setAnchorDate(date);
        actions.setView(options.dayView ?? "day");
      }}
      rows={rows}
    />
  );
}

/**
 * An agenda named `scrolling-agenda` that scrolls through days without end: the days with events
 * `weeks` either way of the anchor date and a page on, of which only those in view render. The
 * anchor date follows the day on top as the list comes to rest, so the title and the load range
 * follow the scroll; Today, Previous, Next, and picked dates jump the list to their date. The
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
