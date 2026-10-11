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
import { useCallback, useLayoutEffect, useMemo, useRef, type CSSProperties, type Ref } from "react";

import type { EventLabeler } from "@registry/calendar/event-label";
import type { UnavailableTimeRender } from "@registry/calendar/unavailable-time";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";

import { LANE_GAP, LANE_HEIGHT, ROW_PADDING } from "./resource-timeline-event";
import { cellTargets } from "./resource-timeline-focus";
import { ResourceTimelineHeader } from "./resource-timeline-header";
import { ResourceTimelineRow } from "./resource-timeline-row";
import { useTimelineLabels } from "./timeline-labels";
import { timelineSlotGroups, timelineSlots, type TimelineSlotUnit } from "./timeline-scale";
import { useTimelineVirtualizer } from "./use-timeline-virtualizer";

export interface ResourceTimelineGridProps<TEvent> {
  /** Where the calendar enters the grid; its cell renders wherever the grid scrolls. */
  readonly entry: CalendarCellFocus | null;
  readonly environment: CalendarEnvironmentBase;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
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
  /** Length of a keyboard step in an hour timeline, in minutes. */
  readonly snapMinutes: number;
}

/** The shortest row, and the two-line header's height, in pixels. */
const MIN_ROW_HEIGHT = 44;
const HEADER_HEIGHT = 64;
/** The narrowest a slot gets before the timeline scrolls sideways. */
const MIN_SLOT_WIDTH: Readonly<Record<TimelineSlotUnit, number>> = { day: 48, hour: 56 };
const HOURS = 24;
/** Without the current time in view, an hour timeline opens at 08:00. */
const DEFAULT_HOUR = 8;

const noCells: readonly CalendarCellFocus[] = [];

/** A row tall enough for its lanes, and never shorter than an empty one. */
function rowHeight(laneCount: number): number {
  return Math.max(MIN_ROW_HEIGHT, 2 * ROW_PADDING + laneCount * (LANE_HEIGHT + LANE_GAP));
}

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
  keyboard,
  label,
  labelEvent,
  projection,
  range,
  ref,
  renderUnavailable,
  snapMinutes,
}: ResourceTimelineGridProps<TEvent>) {
  const { direction, locale, timeZone, weekRules } = environment;
  const { columns, rows, today, unit } = projection;
  const slots = useMemo(() => timelineSlots(range, unit), [range, unit]);
  const groups = useMemo(() => timelineSlotGroups(slots, unit), [slots, unit]);
  const labels = useTimelineLabels(locale, unit);
  const formatTime = useMemo(() => {
    const format = new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    });
    return (instant: Temporal.Instant) => format.format(instant);
  }, [locale, timeZone]);
  const rowKey = useCallback((index: number) => rows[index]!.resource.key, [rows]);
  const rowSize = useCallback((index: number) => rowHeight(rows[index]!.laneCount), [rows]);
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
    const at = nowAt ?? DEFAULT_HOUR / (HOURS * columns.length);
    const viewport = viewportRef.current;
    const width = viewport?.clientWidth ?? 0;
    timeAxis.scrollToOffset(Math.max(0, at * slots.length * slotWidth - width / 3));
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
      className="flex h-full min-h-0 flex-col [--calendar-ghost-background:var(--calendar-selection)] data-interaction:select-none data-[interaction=move]:cursor-grabbing data-[interaction=resize]:cursor-ew-resize"
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
        className="relative min-h-0 flex-1 scroll-ps-(--calendar-resource-column) scroll-pt-(--calendar-timeline-header) overflow-auto overscroll-contain"
      >
        <div className="relative" style={{ height, width: timeAxis.getTotalSize() }}>
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
              labelEvent={labelEvent}
              labels={labels}
              range={range}
              renderUnavailable={renderUnavailable}
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
              className="pointer-events-none absolute z-20 w-0.5 -translate-x-1/2 bg-calendar-now rtl:translate-x-1/2"
              style={{
                height: height - HEADER_HEIGHT,
                insetInlineStart: columnWidth + nowAt * slots.length * slotWidth,
                top: HEADER_HEIGHT,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
