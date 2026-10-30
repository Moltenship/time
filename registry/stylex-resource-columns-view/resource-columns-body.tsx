"use client";

import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import {
  resourceIdAttributes,
  timeGridPosition,
  useNow,
  type CalendarEnvironmentBase,
  type ResourceColumn,
  type TimeGridPosition,
} from "@moltenship/calendar";
import * as stylex from "@stylexjs/stylex";
import type { VirtualItem } from "@tanstack/react-virtual";
import { useMemo, type ReactNode, type RefCallback, type RefObject } from "react";

import type { EventLabeler } from "@registry/stylex-calendar/event-label";
import type { UnavailableTimeRender } from "@registry/stylex-calendar/unavailable-time";
import { calendarVars } from "@registry/stylex-calendar-theme/calendar-tokens.stylex";
import type { CalendarEventColor } from "@registry/stylex-calendar-theme/event-colors";
import { TimeGridHours, useOpeningScroll } from "@registry/stylex-time-grid-view/time-grid-body";
import {
  TimeGridColumn,
  useTimeGridColumnFormats,
  type TimeGridColumnFormats,
} from "@registry/stylex-time-grid-view/time-grid-column";
import type { TimeGridZone } from "@registry/stylex-time-grid-view/time-grid-zones";

import { resourceTitle } from "./resource-columns-header";

const styles = stylex.create({
  canvas: {
    backgroundImage: `linear-gradient(to bottom, ${calendarVars["--calendar-grid"]} 1px, transparent 1px)`,
    backgroundSize: `100% ${calendarVars["--calendar-hour-height"]}`,
    height: `calc(${calendarVars["--calendar-hour-height"]} * 24)`,
    position: "relative",
  },
  hours: {
    height: `calc(${calendarVars["--calendar-hour-height"]} * 24)`,
  },
  resourceDays: {
    display: "grid",
    insetBlock: 0,
    position: "absolute",
  },
  row: {
    display: "flex",
    flex: "1",
    minHeight: 0,
  },
  rowHeader: {
    flexShrink: 0,
    overflow: "clip",
    width: "var(--calendar-gutter-width)",
  },
  scroller: {
    flex: "1",
    minWidth: 0,
    overflow: "auto",
    position: "relative",
    scrollbarGutter: "stable",
  },
});

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
      {...stylex.props(styles.resourceDays)}
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
    <div role="row" {...stylex.props(styles.row)}>
      <div role="rowheader" aria-colindex={1} {...stylex.props(styles.rowHeader)}>
        <VisuallyHidden>Timed events</VisuallyHidden>
        <div ref={followY} {...stylex.props(styles.hours)}>
          <TimeGridHours locale={locale} zones={zones} />
        </div>
      </div>
      <div
        ref={scrollRef}
        data-slot="resource-columns-body"
        {...stylex.props(styles.scroller)}
        onScroll={onScroll}
      >
        <div {...stylex.props(styles.canvas)} style={{ width: totalSize }}>
          {items.map(({ index, key, size, start }) => (
            <ResourceDays
              key={key}
              colIndex={2 + index * (days?.length ?? 1)}
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
