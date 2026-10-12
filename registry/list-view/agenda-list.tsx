import {
  useCalendarFocus,
  type CalendarEnvironmentBase,
  type PlainDateInterval,
} from "@moltenship/calendar";
import {
  useCallback,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
  type RefObject,
} from "react";

import { useEventLabel, type EventDescriber } from "@registry/calendar/event-label";
import { useViewKeyboard } from "@registry/calendar/view-keyboard";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import { cn } from "cn";

import { AgendaDay, type AgendaFormats } from "./agenda-day";
import { rowFrom, type AgendaRow } from "./agenda-rows";
import { useAgendaVirtualizer } from "./use-agenda-virtualizer";

export function useAgendaFormats(locale: Intl.LocalesArgument): AgendaFormats {
  return useMemo(
    () => ({
      date: new Intl.DateTimeFormat(locale, { dateStyle: "full" }),
      range: new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }),
      time: new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }),
      weekday: new Intl.DateTimeFormat(locale, { weekday: "short" }),
    }),
    [locale],
  );
}

/**
 * Whether DOM focus is in `element`. Focus that leaves with an element, as when a focused day
 * scrolls out of the loaded dates, fires no event, so each render checks for it.
 */
function useFocusWithin(element: RefObject<HTMLElement | null>) {
  const [within, setWithin] = useState(false);
  useLayoutEffect(() => {
    if (within && element.current?.contains(document.activeElement) !== true) setWithin(false);
  });
  return {
    onBlur: (event: FocusEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setWithin(false);
    },
    onFocus: () => setWithin(true),
    within,
  };
}

const focusedDate = (focus: { readonly date: Temporal.PlainDate } | null) =>
  focus?.date.toString() ?? null;

export interface AgendaListOptions {
  /** The row on top when the list first renders. */
  readonly initialRow: number;
  /** The visible dates, whose first and last days are where focus enters. */
  readonly range: PlainDateInterval;
  readonly rows: readonly AgendaRow<unknown>[];
}

/**
 * The agenda's scrolling element and its virtualizer. The days where focus enters the range, its
 * first and last, always render, so the list keeps a tab stop; while focus is in the list, the
 * focused day stays rendered as it scrolls away.
 */
export function useAgendaList({ initialRow, range, rows }: AgendaListOptions) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const focusWithin = useFocusWithin(scrollRef);
  const focused = useCalendarFocus(focusedDate);
  const first = Math.min(rowFrom(rows, range.start), rows.length - 1);
  const last = rowFrom(rows, range.end) - 1;
  const focusedRow = focusWithin.within
    ? rows.findIndex((row) => row.kind === "day" && row.key === focused)
    : -1;
  const pinned = useMemo(() => [first, last, focusedRow], [first, focusedRow, last]);
  const { viewportHeight, virtualizer } = useAgendaVirtualizer({
    initialRow,
    pinned,
    rows,
    scrollRef,
  });
  return { focusWithin, scrollRef, viewportHeight, virtualizer };
}

export type AgendaListState = ReturnType<typeof useAgendaList>;

export interface AgendaListProps<TEvent> {
  /** The view's accessible name, as its title. */
  readonly "aria-label": string;
  /** Days before the first row, such as those left out of server markup. */
  readonly before?: number;
  /** Every day listed, counted for `aria-setsize`. */
  readonly days: number;
  readonly describeEvent?: EventDescriber<TEvent>;
  /** What the empty row shows among the days, for dates shown without events; a scrolling agenda's. */
  readonly empty?: ReactNode;
  /** What the end row, a viewport tall, shows; a scrolling agenda has one. */
  readonly end?: ReactNode;
  readonly environment: CalendarEnvironmentBase;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor;
  /** An icon before an event's title, or nothing. */
  readonly getEventIcon?: (event: TEvent) => ReactNode;
  readonly list: AgendaListState;
  readonly loading: boolean;
  readonly onOpenDay: (date: Temporal.PlainDate) => void;
  readonly rows: readonly AgendaRow<TEvent>[];
}

/**
 * The days in view as an `<ol>` in one scrolling element, each placed by the virtualizer and
 * numbered among all the days listed, with a scrolling agenda's empty row among them; then the end
 * of the list when there is one. Without days there's no list, only the end.
 */
export function AgendaList<TEvent>({
  "aria-label": label,
  before = 0,
  days,
  describeEvent,
  empty,
  end,
  environment,
  getEventColor,
  getEventIcon,
  list,
  loading,
  onOpenDay,
  rows,
}: AgendaListProps<TEvent>) {
  const formats = useAgendaFormats(environment.locale);
  const labelEvent = useEventLabel(environment, describeEvent);
  const keyboard = useViewKeyboard();
  const { focusWithin, scrollRef, viewportHeight, virtualizer } = list;
  // One function for every render, so days render again only when they change.
  const latestOpenDay = useRef(onOpenDay);
  useInsertionEffect(() => {
    latestOpenDay.current = onOpenDay;
  });
  const openDay = useCallback((date: Temporal.PlainDate) => latestOpenDay.current(date), []);
  const items = virtualizer.getVirtualItems();
  // Each item's place in the list, for `aria-posinset`: the days, and the empty row among them.
  const ordinals = useMemo(() => {
    let place = before;
    return rows.map((row) => (row.kind === "end" ? place : place++));
  }, [before, rows]);
  const size = days + (rows.some(({ kind }) => kind === "empty") ? 1 : 0);

  return (
    <div
      ref={scrollRef}
      {...keyboard}
      onBlur={(event) => {
        keyboard.onBlur(event);
        focusWithin.onBlur(event);
      }}
      onFocus={focusWithin.onFocus}
      data-slot="agenda-view"
      className="relative h-full overflow-y-auto"
    >
      {days > 0 && (
        <ol
          aria-label={label}
          aria-busy={loading || undefined}
          className="relative"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {items.map(({ index, key, start }) => {
            const row = rows[index]!;
            if (row.kind === "end") return null;
            const position = ordinals[index]!;
            const item = {
              "aria-posinset": position + 1,
              "aria-setsize": size,
              className: cn(
                "absolute inset-x-0",
                position < size - 1 && "border-b border-calendar-grid",
              ),
              "data-index": index,
              ref: virtualizer.measureElement,
              style: { top: start },
            };
            return row.kind === "empty" ? (
              <li key={key} {...item}>
                {empty}
              </li>
            ) : (
              <AgendaDay
                key={key}
                {...item}
                day={row.day}
                formats={formats}
                getEventColor={getEventColor}
                getEventIcon={getEventIcon}
                labelEvent={labelEvent}
                onOpenDay={openDay}
              />
            );
          })}
        </ol>
      )}
      {items.map(({ index, key, start }) =>
        rows[index]!.kind === "end" ? (
          <div
            key={key}
            ref={virtualizer.measureElement}
            data-index={index}
            className="absolute inset-x-0 flex flex-col"
            style={{ height: viewportHeight, top: start }}
          >
            {end}
          </div>
        ) : null,
      )}
    </div>
  );
}
