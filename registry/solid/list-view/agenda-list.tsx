import {
  useCalendarFocus,
  type CalendarEnvironmentBase,
  type PlainDateInterval,
} from "@moltenship/calendar-solid";
import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, For, Show, type Accessor } from "solid-js";

import { useEventLabel, type EventDescriber } from "@registry/calendar/event-label";
import { useViewKeyboard } from "@registry/calendar/view-keyboard";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import { agendaFormats, type AgendaFormats } from "@registry/shared/list-view/agenda-labels";
import { rowFrom, type AgendaRow } from "@registry/shared/list-view/agenda-rows";
import {
  agendaEndRowClass,
  agendaListClass,
  agendaRowClass,
  agendaScrollClass,
} from "@registry/shared/list-view/agenda.styles";

import { AgendaDay } from "./agenda-day";
import { useAgendaVirtualizer } from "./use-agenda-virtualizer";

export function useAgendaFormats(locale: Accessor<Intl.LocalesArgument>): Accessor<AgendaFormats> {
  return createMemo(() => agendaFormats(locale()));
}

const sameRows = (left: readonly number[], right: readonly number[]) =>
  left.length === right.length && left.every((index, at) => index === right[at]);

export interface AgendaListOptions {
  /** The row on top when the list first renders. */
  readonly initialRow: number;
  /** The visible dates, whose first and last days are where focus enters. */
  readonly range: Accessor<PlainDateInterval>;
  readonly rows: Accessor<readonly AgendaRow<unknown>[]>;
}

/**
 * The agenda's scrolling element and its virtualizer. The days where focus enters the range, its
 * first and last, always render, so the list keeps a tab stop; while focus is in the list, the
 * focused day stays rendered as it scrolls away. `ref` goes on the scrolling element.
 */
export function useAgendaList({ initialRow, range, rows }: AgendaListOptions) {
  // Set by the ref once, before any effect reads it.
  let scrollElement: HTMLDivElement | undefined;
  // Whether DOM focus is in the list.
  const [within, setWithin] = createSignal(false, { ownedWrite: true });
  const focused = useCalendarFocus((focus) => focus?.date.toString() ?? null);
  const pinned = createMemo(
    () => {
      const all = rows();
      const first = Math.min(rowFrom(all, range().start), all.length - 1);
      const last = rowFrom(all, range().end) - 1;
      const focusedRow = within()
        ? all.findIndex((row) => row.kind === "day" && row.key === focused())
        : -1;
      return [first, last, focusedRow];
    },
    { equals: sameRows },
  );
  const virtual = useAgendaVirtualizer({
    initialRow,
    pinned,
    rows,
    scrollElement: () => scrollElement,
  });
  // Focus that leaves with an element, as when a focused day scrolls out of the loaded dates,
  // fires no event, so each render checks for it.
  createEffect(
    () => (virtual.items(), within()),
    (inside) => {
      if (inside && scrollElement?.contains(document.activeElement) !== true) setWithin(false);
    },
  );

  const ref = (element: HTMLDivElement) => {
    scrollElement = element;
    element.addEventListener("focusin", () => setWithin(true));
    element.addEventListener("focusout", (event) => {
      if (!element.contains(event.relatedTarget as Node | null)) setWithin(false);
    });
  };
  return { ...virtual, ref };
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
  readonly empty?: JSX.Element;
  /** What the end row, a viewport tall, shows; a scrolling agenda has one. */
  readonly end?: JSX.Element;
  readonly environment: CalendarEnvironmentBase;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor;
  /** An icon before an event's title, or nothing. */
  readonly getEventIcon?: (event: TEvent) => JSX.Element;
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
export function AgendaList<TEvent>(props: AgendaListProps<TEvent>) {
  const formats = useAgendaFormats(() => props.environment.locale);
  const labelEvent = useEventLabel(
    () => props.environment,
    () => props.describeEvent,
  );
  const keyboard = useViewKeyboard();
  const openDay = (date: Temporal.PlainDate) => props.onOpenDay(date);
  // Each item's place in the list, for `aria-posinset`: the days, and the empty row among them.
  const ordinals = createMemo(() => {
    let place = props.before ?? 0;
    return props.rows.map((row) => (row.kind === "end" ? place : place++));
  });
  const size = () => props.days + (props.rows.some(({ kind }) => kind === "empty") ? 1 : 0);
  const listed = createMemo(() =>
    props.list.items().filter(({ index }) => props.rows[index]?.kind !== "end"),
  );
  const ends = createMemo(() =>
    props.list.items().filter(({ index }) => props.rows[index]?.kind === "end"),
  );

  return (
    <div ref={[props.list.ref, keyboard]} data-slot="agenda-view" class={agendaScrollClass}>
      <Show when={props.days > 0}>
        <ol
          aria-label={props["aria-label"]}
          aria-busy={props.loading ? "true" : undefined}
          class={agendaListClass}
          style={{ height: `${props.list.totalSize()}px` }}
        >
          <For each={listed()} keyed={(item) => item.key}>
            {(item) => {
              const index = () => item().index;
              const row = () => props.rows[index()]!;
              const position = () => ordinals()[index()]!;
              const measure = props.list.measure(index);
              const attributes = {
                get "aria-posinset"() {
                  return position() + 1;
                },
                get "aria-setsize"() {
                  return size();
                },
                get class() {
                  return agendaRowClass(position() === size() - 1);
                },
                get "data-index"() {
                  return index();
                },
                ref: measure,
                get style() {
                  return { top: `${item().start}px` };
                },
              };
              const day = () => {
                const current = row();
                return current.kind === "day" ? current.day : undefined;
              };
              return (
                <Show when={day()} fallback={<li {...attributes}>{props.empty}</li>}>
                  {(shown) => (
                    <AgendaDay
                      {...attributes}
                      day={shown()}
                      formats={formats()}
                      getEventColor={props.getEventColor}
                      getEventIcon={props.getEventIcon}
                      labelEvent={labelEvent()}
                      onOpenDay={openDay}
                    />
                  )}
                </Show>
              );
            }}
          </For>
        </ol>
      </Show>
      <For each={ends()} keyed={(item) => item.key}>
        {(item) => {
          const measure = props.list.measure(() => item().index);
          return (
            <div
              ref={measure}
              data-index={item().index}
              class={agendaEndRowClass}
              style={{ height: `${props.list.viewportHeight()}px`, top: `${item().start}px` }}
            >
              {props.end}
            </div>
          );
        }}
      </For>
    </div>
  );
}
