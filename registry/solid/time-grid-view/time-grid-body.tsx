import {
  timeGridPosition,
  useNow,
  type CalendarEnvironmentBase,
  type TimeGridDay,
} from "@moltenship/calendar-solid";
import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, For, Show, type Accessor } from "solid-js";

import type { EventLabeler } from "@registry/calendar/event-label";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import {
  dayColumns,
  hourTop,
  labelledHours,
  openingScrollTop,
} from "@registry/shared/time-grid-view/time-grid-geometry";
import { timedEventsLabel } from "@registry/shared/time-grid-view/time-grid-labels";
import {
  srOnlyClass,
  timeGridBodyClass,
  timeGridColumnsClass,
  timeGridDisplayHoursClass,
  timeGridHourLabelClass,
  timeGridHoursClass,
  timeGridRowHeaderClass,
  timeGridTimedRowClass,
  timeGridZonedHoursClass,
} from "@registry/shared/time-grid-view/time-grid.styles";

import { TimeGridColumn, useTimeGridColumnFormats } from "./time-grid-column";
import { TimeGridZoneHours, zoneTimeFormat, type TimeGridZone } from "./time-grid-zones";

export interface TimeGridBodyProps<TEvent> {
  readonly days: readonly TimeGridDay<TEvent>[];
  readonly environment: CalendarEnvironmentBase;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
  readonly getEventIcon?: (event: TEvent) => JSX.Element;
  /** The root takes no changes: events have no resize handles. */
  readonly isReadOnly?: boolean;
  readonly labelEvent: EventLabeler<TEvent>;
  /** Opens a date in the day view; Shift+Enter on a slot does so. */
  readonly onOpenDay?: (date: Temporal.PlainDate) => void;
  /** Receives the scrolling element, which dragging also scrolls near its edges. */
  readonly ref?: (element: HTMLDivElement) => void;
  /** Length of a keyboard slot, as the keyboard's snap sets it. */
  readonly slotMinutes: number;
  /** The root's secondary time zones, with an hour column each; see `useTimeGridZones`. */
  readonly zones?: readonly TimeGridZone[];
}

const noZones: readonly TimeGridZone[] = [];

/**
 * The gutter's hour labels, from 1:00 to 23:00, over the full height of the element around it.
 * Each secondary zone's hours come first, in a `--calendar-zone-width` column of their own.
 */
export function TimeGridHours(props: {
  readonly locale: Intl.LocalesArgument;
  readonly zones?: readonly TimeGridZone[];
}) {
  // "1 PM" where the locale uses a 12-hour clock, "13:00" where it uses 24 hours.
  const format = createMemo(() => zoneTimeFormat(props.locale));
  const zones = () => props.zones ?? noZones;
  const hours = () => (
    <div aria-hidden="true" class={timeGridHoursClass}>
      <For each={labelledHours}>
        {(hour) => (
          <span class={timeGridHourLabelClass} style={{ top: hourTop(hour) }}>
            {format()(new Temporal.PlainTime(hour))}
          </span>
        )}
      </For>
    </div>
  );

  return (
    <Show when={zones().length > 0} fallback={hours()}>
      <div class={timeGridZonedHoursClass}>
        <For each={zones()} keyed={false}>
          {(zone) => <TimeGridZoneHours locale={props.locale} zone={zone()} />}
        </For>
        <div class={timeGridDisplayHoursClass}>{hours()}</div>
      </div>
    </Show>
  );
}

/**
 * Once the first clock sample arrives (after hydration, `now` starts as null), opens the scroll
 * element on the current time at `nowTop`, or on 08:00 when the current time is not visible.
 * Later ticks and navigation keep the user's scroll position.
 */
export function useOpeningScroll(
  scroll: () => HTMLElement | undefined,
  now: Accessor<Temporal.Instant | null>,
  nowTop: Accessor<number | null>,
): void {
  let scrolled = false;
  createEffect(
    () => ({ now: now(), top: nowTop() }),
    ({ now: instant, top }) => {
      const node = scroll();
      if (scrolled || node === undefined || instant === null) return;
      scrolled = true;
      node.scrollTop = openingScrollTop(top, node.scrollHeight, node.clientHeight);
    },
  );
}

/** The grid's timed row, scrolling through 24 hours: hour gutter, hour lines, and a cell per day. */
export function TimeGridBody<TEvent>(props: TimeGridBodyProps<TEvent>) {
  let body: HTMLDivElement | undefined;
  const now = useNow();
  const nowPosition = createMemo(() => {
    const instant = now();
    return instant === null
      ? null
      : timeGridPosition(
          props.days.map(({ column }) => column),
          instant,
        );
  });
  const formats = useTimeGridColumnFormats(() => props.environment.locale);
  useOpeningScroll(
    () => body,
    now,
    () => nowPosition()?.top ?? null,
  );

  return (
    <div
      ref={(element) => {
        body = element;
        props.ref?.(element);
      }}
      data-slot="time-grid-body"
      class={timeGridBodyClass}
    >
      <div role="row" class={timeGridTimedRowClass}>
        <div role="rowheader" class={timeGridRowHeaderClass}>
          <span class={srOnlyClass}>{timedEventsLabel}</span>
          <TimeGridHours locale={props.environment.locale} zones={props.zones} />
        </div>
        <div
          class={timeGridColumnsClass}
          style={{ "grid-template-columns": dayColumns(props.days.length) }}
        >
          <For each={props.days} keyed={(day) => day.column.key}>
            {(day, index) => (
              <TimeGridColumn
                day={day()}
                getEventColor={props.getEventColor}
                getEventIcon={props.getEventIcon}
                isReadOnly={props.isReadOnly}
                labelEvent={props.labelEvent}
                nowTop={nowPosition()?.column === index() ? nowPosition()!.top : null}
                formats={formats()}
                onOpenDay={props.onOpenDay}
                slotMinutes={props.slotMinutes}
                timeZone={props.environment.timeZone}
                zones={props.zones}
              />
            )}
          </For>
        </div>
      </div>
    </div>
  );
}
