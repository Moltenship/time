"use client";

import {
  resourceIdAttributes,
  timeGridPosition,
  useNow,
  type CalendarEnvironmentBase,
  type ResourceColumn,
  type TimeGridPosition,
} from "@moltenship/calendar";
import type { VirtualItem } from "@tanstack/virtual-core";
import { useMemo, type ReactNode, type RefCallback, type RefObject } from "react";

import type { EventLabeler } from "@registry/calendar/event-label";
import type { UnavailableTimeRender } from "@registry/calendar/unavailable-time";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import { resourceTitle } from "@registry/shared/resource-columns-view/resource-columns-labels";
import { resourceColIndex } from "@registry/shared/resource-columns-view/resource-columns-layout";
import {
  resourceBodyClass,
  resourceBodyGutterClass,
  resourceBodyHoursClass,
  resourceBodyRowClass,
  resourceBodyTrackClass,
  resourceDaysClass,
} from "@registry/shared/resource-columns-view/resource-columns.styles";
import { dayColumns } from "@registry/shared/time-grid-view/time-grid-geometry";
import { timedEventsLabel } from "@registry/shared/time-grid-view/time-grid-labels";
import { srOnlyClass } from "@registry/shared/time-grid-view/time-grid.styles";
import { TimeGridHours, useOpeningScroll } from "@registry/time-grid-view/time-grid-body";
import {
  TimeGridColumn,
  useTimeGridColumnFormats,
  type TimeGridColumnFormats,
} from "@registry/time-grid-view/time-grid-column";
import type { TimeGridZone } from "@registry/time-grid-view/time-grid-zones";

export interface ResourceColumnsBodyProps<TEvent> {
  readonly environment: CalendarEnvironmentBase;
  /** Follows the body's vertical scroll; see `useAxisSync`. */
  readonly followY: RefCallback<HTMLElement>;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
  readonly getEventIcon?: (event: TEvent) => ReactNode;
  /** The root takes no changes: events have no resize handles. */
  readonly isReadOnly?: boolean;
  /** The rendered columns, from the column virtualizer. */
  readonly items: readonly VirtualItem[];
  readonly labelEvent: EventLabeler<TEvent>;
  readonly onScroll: () => void;
  readonly renderUnavailable?: UnavailableTimeRender;
  readonly resources: readonly ResourceColumn<TEvent>[];
  /** The scrolling element, which the virtualizer reads and dragging scrolls near its edges. */
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  /** Length of a keyboard slot, as the keyboard's snap sets it. */
  readonly slotMinutes: number;
  readonly totalSize: number;
  /** The root's secondary time zones, with an hour column each in the gutter. */
  readonly zones?: readonly TimeGridZone[];
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
  getEventIcon,
  isReadOnly,
  labelEvent,
  now,
  renderUnavailable,
  size,
  slotMinutes,
  start,
  timeZone,
  zones,
}: {
  readonly column: ResourceColumn<TEvent>;
  readonly colIndex: number;
  readonly formats: TimeGridColumnFormats;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
  readonly getEventIcon?: (event: TEvent) => ReactNode;
  readonly isReadOnly: boolean | undefined;
  readonly labelEvent: EventLabeler<TEvent>;
  readonly now: TimeGridPosition | null;
  readonly renderUnavailable?: UnavailableTimeRender;
  readonly size: number;
  readonly slotMinutes: number;
  readonly start: number;
  readonly timeZone: string;
  readonly zones: readonly TimeGridZone[] | undefined;
}) {
  const title = resourceTitle(resource);
  const here = useMemo(
    () => ({ id: resource.id, resource: resource.resource, title }),
    [resource.id, resource.resource, title],
  );

  return (
    <div
      {...resourceIdAttributes(resource.id)}
      className={resourceDaysClass}
      style={{
        gridTemplateColumns: dayColumns(days.length),
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
          getEventIcon={getEventIcon}
          isReadOnly={isReadOnly}
          labelEvent={labelEvent}
          nowTop={now?.column === index ? now.top : null}
          renderUnavailable={renderUnavailable}
          resource={here}
          slotMinutes={slotMinutes}
          timeZone={timeZone}
          zones={zones}
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
  getEventIcon,
  isReadOnly,
  items,
  labelEvent,
  onScroll,
  renderUnavailable,
  resources,
  scrollRef,
  slotMinutes,
  totalSize,
  zones,
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
    <div role="row" className={resourceBodyRowClass}>
      <div role="rowheader" aria-colindex={1} className={resourceBodyGutterClass}>
        <span className={srOnlyClass}>{timedEventsLabel}</span>
        <div ref={followY} className={resourceBodyHoursClass}>
          <TimeGridHours locale={locale} zones={zones} />
        </div>
      </div>
      <div
        ref={scrollRef}
        data-slot="resource-columns-body"
        className={resourceBodyClass}
        onScroll={onScroll}
      >
        <div className={resourceBodyTrackClass} style={{ width: totalSize }}>
          {items.map(({ index, key, size, start }) => (
            <ResourceDays
              key={key}
              colIndex={resourceColIndex(index, days?.length ?? 1)}
              column={resources[index]!}
              formats={formats}
              getEventColor={getEventColor}
              getEventIcon={getEventIcon}
              isReadOnly={isReadOnly}
              labelEvent={labelEvent}
              now={nowPosition}
              renderUnavailable={renderUnavailable}
              size={size}
              slotMinutes={slotMinutes}
              start={start}
              timeZone={timeZone}
              zones={zones}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
