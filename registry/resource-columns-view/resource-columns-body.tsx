import {
  resourceIdAttributes,
  timeGridPosition,
  useNow,
  type CalendarEnvironmentBase,
  type ResourceColumn,
  type TimeGridPosition,
} from "@moltenship/calendar";
import type { VirtualItem } from "@tanstack/react-virtual";
import { useMemo, type RefCallback, type RefObject } from "react";

import type { EventLabeler } from "@registry/calendar/event-label";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import { TimeGridHours, useOpeningScroll } from "@registry/time-grid-view/time-grid-body";
import {
  TimeGridColumn,
  useTimeGridColumnFormats,
  type TimeGridColumnFormats,
} from "@registry/time-grid-view/time-grid-column";

import { resourceTitle } from "./resource-columns-header";

export interface ResourceColumnsBodyProps<TEvent> {
  readonly environment: CalendarEnvironmentBase;
  /** Follows the body's vertical scroll; see `useAxisSync`. */
  readonly followY: RefCallback<HTMLElement>;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
  /** The rendered columns, from the column virtualizer. */
  readonly items: readonly VirtualItem[];
  readonly labelEvent: EventLabeler<TEvent>;
  readonly onScroll: () => void;
  readonly resources: readonly ResourceColumn<TEvent>[];
  /** The scrolling element, which the virtualizer reads and dragging scrolls near its edges. */
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  /** Length of a keyboard slot, as the keyboard's snap sets it. */
  readonly slotMinutes: number;
  readonly totalSize: number;
}

/**
 * One resource's day columns. `data-resource-id` around them puts every drop, create, and
 * keyboard cell inside in this resource.
 */
function ResourceDays<TEvent>({
  column: { days, resource },
  colIndex,
  formats,
  getEventColor,
  labelEvent,
  now,
  size,
  slotMinutes,
  start,
  timeZone,
}: {
  readonly column: ResourceColumn<TEvent>;
  readonly colIndex: number;
  readonly formats: TimeGridColumnFormats;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
  readonly labelEvent: EventLabeler<TEvent>;
  readonly now: TimeGridPosition | null;
  readonly size: number;
  readonly slotMinutes: number;
  readonly start: number;
  readonly timeZone: string;
}) {
  const title = resourceTitle(resource);
  const here = useMemo(() => ({ id: resource.id, title }), [resource.id, title]);

  return (
    <div
      {...resourceIdAttributes(resource.id)}
      className="absolute inset-y-0 grid"
      style={{
        gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
        insetInlineStart: start,
        width: size,
      }}
    >
      {days.map((day, index) => (
        <TimeGridColumn
          key={day.column.key}
          colIndex={colIndex + index}
          day={day}
          formats={formats}
          getEventColor={getEventColor}
          labelEvent={labelEvent}
          nowTop={now?.column === index ? now.top : null}
          resource={here}
          slotMinutes={slotMinutes}
          timeZone={timeZone}
        />
      ))}
    </div>
  );
}

/**
 * The grid's timed row: the hour gutter, then the 24 hours of every rendered resource column,
 * scrolling both ways. Each resource holds one `TimeGridColumn` per day, so events, the keyboard
 * slot, daylight-saving bands, and the now-line render as in the week and day views.
 */
export function ResourceColumnsBody<TEvent>({
  environment,
  followY,
  getEventColor,
  items,
  labelEvent,
  onScroll,
  resources,
  scrollRef,
  slotMinutes,
  totalSize,
}: ResourceColumnsBodyProps<TEvent>) {
  const { locale, timeZone } = environment;
  const days = resources[0]?.days;
  const now = useNow();
  const nowPosition = useMemo(
    () =>
      now === null || days === undefined
        ? null
        : timeGridPosition(
            days.map(({ column }) => column),
            now,
          ),
    [days, now],
  );
  const formats = useTimeGridColumnFormats(locale);
  useOpeningScroll(scrollRef, now, nowPosition?.top ?? null);

  return (
    <div role="row" className="flex min-h-0 flex-1">
      <div
        role="rowheader"
        aria-colindex={1}
        className="w-(--calendar-gutter-width) shrink-0 overflow-clip"
      >
        <span className="sr-only">Timed events</span>
        <div ref={followY} className="h-[calc(var(--calendar-hour-height)*24)]">
          <TimeGridHours locale={locale} />
        </div>
      </div>
      <div
        ref={scrollRef}
        data-slot="resource-columns-body"
        className="relative min-w-0 flex-1 overflow-auto [scrollbar-gutter:stable]"
        onScroll={onScroll}
      >
        <div
          className="relative h-[calc(var(--calendar-hour-height)*24)] bg-[linear-gradient(to_bottom,var(--calendar-grid)_1px,transparent_1px)] bg-size-[100%_var(--calendar-hour-height)]"
          style={{ width: totalSize }}
        >
          {items.map(({ index, key, size, start }) => (
            <ResourceDays
              key={key}
              colIndex={2 + index * (days?.length ?? 1)}
              column={resources[index]!}
              formats={formats}
              getEventColor={getEventColor}
              labelEvent={labelEvent}
              now={nowPosition}
              size={size}
              slotMinutes={slotMinutes}
              start={start}
              timeZone={timeZone}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
