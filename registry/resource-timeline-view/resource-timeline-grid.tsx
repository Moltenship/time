"use client";

import {
  timelinePosition,
  useCalendarFocus,
  useNow,
  type CalendarCellFocus,
  type CalendarEnvironmentBase,
  type CalendarKeyboardHandlers,
  type PlainDateInterval,
  type ResourceTimelineProjection,
} from "@moltenship/calendar";
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react";

import type { EventLabeler } from "@registry/calendar/event-label";
import type { ResourceStatusOptions } from "@registry/calendar/resource-status";
import type { UnavailableTimeRender } from "@registry/calendar/unavailable-time";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import {
  timelineCanvasClass,
  timelineGridClass,
  timelineNowClass,
  timelineViewportClass,
} from "@registry/shared/resource-timeline-view/resource-timeline.styles";
import { cellTargets } from "@registry/shared/resource-timeline-view/timeline-focus";
import {
  timelineLabels,
  timelineTimeFormat,
} from "@registry/shared/resource-timeline-view/timeline-labels";
import {
  HEADER_HEIGHT,
  MIN_SLOT_WIDTH,
  nowLineBox,
  openingOffset,
  rowHeight,
} from "@registry/shared/resource-timeline-view/timeline-placement";
import {
  timelineSlotGroups,
  timelineSlots,
} from "@registry/shared/resource-timeline-view/timeline-scale";

import { ResourceTimelineHeader } from "./resource-timeline-header";
import { ResourceTimelineRow } from "./resource-timeline-row";
import { useTimelineVirtualizer } from "./use-timeline-virtualizer";

export interface ResourceTimelineGridProps<TEvent> {
  /** Where the calendar enters the grid; its cell renders wherever the grid scrolls. */
  readonly entry: CalendarCellFocus | null;
  readonly environment: CalendarEnvironmentBase;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
  /** An icon before an event's title, or nothing. */
  readonly getEventIcon?: (event: TEvent) => ReactNode;
  /** The root takes no changes: events have no resize handles. */
  readonly isReadOnly?: boolean;
  /** The view's keyboard handlers; the grid is its one tab stop. */
  readonly keyboard: CalendarKeyboardHandlers;
  /** The grid's accessible name, such as the visible range. */
  readonly label: string;
  readonly labelEvent: EventLabeler<TEvent>;
  readonly projection: ResourceTimelineProjection<TEvent>;
  readonly range: PlainDateInterval;
  /** The grid element, for the pointer layer and the keyboard. */
  readonly ref?: Ref<HTMLDivElement>;
  readonly renderUnavailable?: UnavailableTimeRender;
  /** Whether row headers show each resource's status. */
  readonly resourceStatus: ResourceStatusOptions | null;
  /** Length of a keyboard step in an hour timeline, in minutes. */
  readonly snapMinutes: number;
}

const noCells: readonly CalendarCellFocus[] = [];

/**
 * Resources as rows and time as columns in one scrolling viewport. The header and the resource
 * column are sticky, and only the rows and slots in view render, so 500 resources over a month
 * stay as light as a dozen. Rows grow to fit their lanes, keyboard focus scrolls into view, and
 * the time axis runs in the calendar's direction.
 */
export function ResourceTimelineGrid<TEvent>({
  entry,
  environment,
  getEventColor,
  getEventIcon,
  isReadOnly,
  keyboard,
  label,
  labelEvent,
  projection,
  range,
  ref,
  renderUnavailable,
  resourceStatus,
  snapMinutes,
}: ResourceTimelineGridProps<TEvent>) {
  const { direction, locale, timeZone, weekRules } = environment;
  const { columns, rows, today, unit } = projection;
  const slots = useMemo(() => timelineSlots(range, unit), [range, unit]);
  const groups = useMemo(() => timelineSlotGroups(slots, unit), [slots, unit]);
  const labels = useMemo(() => timelineLabels(locale, unit), [locale, unit]);
  const formatTime = useMemo(() => timelineTimeFormat(locale, timeZone), [locale, timeZone]);
  const rowKey = useCallback((index: number) => rows[index]!.resource.key, [rows]);
  const rowSize = useCallback((index: number) => rowHeight(rows[index]!), [rows]);
  const slotKey = useCallback((index: number) => slots[index]!.key, [slots]);
  // The entry and the focused row and slot always render, so there is always a tab stop, roving
  // focus finds its element at once, and the browser scrolls it into view clear of the sticky
  // header and column (`scroll-padding`).
  const focus = useCalendarFocus((current) => current);
  const targets = useMemo(
    () => cellTargets(focus, entry, projection, range),
    [entry, focus, projection, range],
  );
  const { columnWidth, rowAxis, slotWidth, timeAxis, viewportRef } = useTimelineVirtualizer({
    direction,
    headerHeight: HEADER_HEIGHT,
    rows: { count: rows.length, height: rowSize, key: rowKey, pinned: targets.rows },
    slots: {
      count: slots.length,
      key: slotKey,
      minWidth: MIN_SLOT_WIDTH[unit],
      pinned: targets.slots,
    },
  });
  const visibleSlots = timeAxis.getVirtualItems();
  const height = rowAxis.getTotalSize();

  // An hour timeline opens on the current time once the first clock sample arrives (after
  // hydration, `now` starts as null), or on 08:00 when today isn't shown. Later ticks and
  // navigation keep the scroll position.
  const now = useNow();
  const nowAt = now === null ? null : timelinePosition(columns, now);
  const opened = useRef(false);
  useLayoutEffect(() => {
    if (opened.current || now === null || unit !== "hour") return;
    opened.current = true;
    const viewport = viewportRef.current;
    timeAxis.scrollToOffset(
      openingOffset(nowAt, columns.length, slots.length, slotWidth, viewport?.clientWidth ?? 0),
    );
    // The axis re-applies the offset it last saw when it re-attaches, as under StrictMode: let it
    // see this one now.
    viewport?.dispatchEvent(new Event("scroll"));
  }, [columns.length, now, nowAt, slotWidth, slots.length, timeAxis, unit, viewportRef]);

  return (
    <div
      ref={ref}
      role="grid"
      aria-colcount={slots.length + 1}
      aria-label={label}
      aria-rowcount={rows.length + 1}
      {...keyboard}
      data-slot="resource-timeline"
      dir={direction}
      className={timelineGridClass(isReadOnly)}
      style={
        {
          "--calendar-resource-column": `${columnWidth}px`,
          "--calendar-timeline-header": `${HEADER_HEIGHT}px`,
        } as CSSProperties
      }
    >
      <div
        ref={viewportRef}
        data-slot="resource-timeline-viewport"
        className={timelineViewportClass}
      >
        <div className={timelineCanvasClass} style={{ height, width: timeAxis.getTotalSize() }}>
          <ResourceTimelineHeader
            groups={groups}
            labels={labels}
            slotWidth={slotWidth}
            slots={slots}
            today={today}
            unit={unit}
            visibleSlots={visibleSlots}
          />
          {rowAxis.getVirtualItems().map((virtualRow) => (
            <ResourceTimelineRow
              key={virtualRow.key}
              columns={columns}
              cells={targets.cells.get(virtualRow.index) ?? noCells}
              environment={environment}
              formatTime={formatTime}
              getEventColor={getEventColor}
              getEventIcon={getEventIcon}
              isReadOnly={isReadOnly}
              labelEvent={labelEvent}
              labels={labels}
              range={range}
              renderUnavailable={renderUnavailable}
              resourceStatus={resourceStatus}
              row={rows[virtualRow.index]!}
              slotWidth={slotWidth}
              slots={slots}
              snapMinutes={snapMinutes}
              unit={unit}
              virtualRow={virtualRow}
              visibleSlots={visibleSlots}
              weekend={weekRules.weekend}
            />
          ))}
          {nowAt !== null && (
            <div
              aria-hidden
              data-slot="resource-timeline-now"
              className={timelineNowClass}
              style={nowLineBox(nowAt, height, columnWidth, slots.length, slotWidth)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
