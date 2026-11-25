import {
  defineCalendarView,
  getListTitle,
  scrollingListStrategy,
  type CalendarViewRendererProps,
  type EventId,
  type ListProjection,
  type ResourceId,
} from "@moltenship/calendar-solid";
import { createEffect, createMemo, untrack } from "solid-js";

import { AgendaList, useAgendaFormats, useAgendaList } from "@registry/list-view/agenda-list";
import { AgendaEndMessage, EmptyAgenda } from "@registry/list-view/agenda-states";
import type { AgendaViewOptions } from "@registry/list-view/agenda-view";
import { agendaDates } from "@registry/shared/list-view/agenda-labels";
import { agendaRows, rowFrom } from "@registry/shared/list-view/agenda-rows";
import { scrollingAgendaEmptyClass } from "@registry/shared/list-view/agenda.styles";

import { useAgendaScroll } from "./use-agenda-scroll";

export interface ScrollingAgendaViewOptions<TEvent> extends AgendaViewOptions<TEvent> {
  /** The registered view a date opens, `"day"` by default. */
  readonly dayView?: string;
}

type ScrollingAgendaViewProps<TEvent> = CalendarViewRendererProps<
  ListProjection<TEvent, EventId, ResourceId>,
  ScrollingAgendaViewOptions<TEvent>
>;

/**
 * The days with events in the loaded dates, then the end of the list. When the dates shown have
 * none, the empty state stands in for them, at the end or among the days after them; past the end
 * of the list, scrolling on moves through the weeks without events.
 */
function ScrollingAgendaView<TEvent>(props: ScrollingAgendaViewProps<TEvent>) {
  const rows = createMemo(() =>
    agendaRows(props.projection.days, {
      loaded: props.loadRange ?? props.range,
      shown: props.range,
    }),
  );
  const list = useAgendaList({
    initialRow: untrack(() => rowFrom(rows(), props.range.start)),
    range: () => props.range,
    rows,
  });
  useAgendaScroll({
    afterLayout: list.afterLayout,
    onScroll: (date) => props.actions.setAnchorDate(date),
    range: () => props.range,
    rows,
    scrollElement: list.scrollElement,
    virtualizer: list.virtualizer,
  });
  const formats = useAgendaFormats(() => props.environment.locale);
  const loading = () => props.options.loading === true;
  const endRow = () => rows().at(-1);
  const empty = createMemo(() =>
    rows().some((row) => row.kind === "empty" || (row.kind === "end" && row.shown)),
  );
  const emptyState = () => (
    <div class={scrollingAgendaEmptyClass}>
      <EmptyAgenda
        dates={agendaDates(formats(), props.range)}
        loading={loading()}
        start={props.range.start}
      />
    </div>
  );

  // The empty state had focus when the dates shown got days, which takes it away: focus moves on
  // to their first event, where Tab lands, instead of falling to the page.
  createEffect(
    () => ({ empty: empty(), within: list.within() }),
    ({ empty: now, within }, was) => {
      const page = list.scrollElement()?.ownerDocument;
      if (was?.empty !== true || now || !within || page?.activeElement !== page?.body) return;
      const all = untrack(rows);
      const row =
        all[
          rowFrom(
            all,
            untrack(() => props.range.start),
          )
        ];
      const item = row?.kind === "day" ? row.day.items[0] : undefined;
      if (row?.kind === "day" && item !== undefined) {
        props.actions.setFocus({ date: row.day.date, eventId: item.event.id, kind: "event" });
      }
    },
  );

  return (
    <AgendaList
      aria-label={getListTitle(props.range, props.environment)}
      days={props.projection.days.length}
      describeEvent={props.options.describeEvent}
      environment={props.environment}
      getEventColor={props.options.getEventColor}
      getEventIcon={props.options.getEventIcon}
      empty={emptyState()}
      end={(() => {
        const last = endRow();
        return last?.kind === "end" && last.shown ? (
          emptyState()
        ) : (
          <AgendaEndMessage
            empty={last?.kind === "end" ? last.empty : null}
            formats={formats()}
            loading={loading()}
          />
        );
      })()}
      list={list}
      loading={loading()}
      onOpenDay={(date) => {
        props.actions.setAnchorDate(date);
        props.actions.setView(props.options.dayView ?? "day");
      }}
      rows={rows()}
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
