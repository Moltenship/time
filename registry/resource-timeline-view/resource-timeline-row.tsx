import {
  resourceIdAttributes,
  useClosedDates,
  useResourceExpansion,
  useTimelineAvailability,
  type CalendarCellFocus,
  type CalendarEnvironmentBase,
  type IsoDayOfWeek,
  type PlainDateInterval,
  type ResourceId,
  type ResourceTimelineDayRow,
  type ResourceTimelineHourRow,
  type TimeGridColumn,
} from "@moltenship/calendar";
import type { VirtualItem } from "@tanstack/react-virtual";
import { ChevronRightIcon } from "lucide-react";
import { memo, useCallback, useMemo, type CSSProperties } from "react";

import type { EventLabeler } from "@registry/calendar/event-label";
import { ResourceTime, useResourceTime } from "@registry/calendar/resource-time";
import {
  draftCheckClassName,
  previewCheckAttributes,
  useDraftCheck,
} from "@registry/calendar/preview-check";
import type { UnavailableTimeRender } from "@registry/calendar/unavailable-time";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import { cn } from "cn";
import { Button } from "@registry/ui/button";

import {
  closedDayExtents,
  isUnavailableIn,
  TimelineAvailability,
} from "./resource-timeline-availability";
import { ResourceTimelineEvent } from "./resource-timeline-event";
import { GroupCellTarget, TimelineCellTarget, useRowDraft } from "./resource-timeline-focus";
import type { TimelineLabels } from "./timeline-labels";
import { anchorSlot, placeBars, rowBars, slotsCovered } from "./timeline-placement";
import type { TimelineSlot, TimelineSlotUnit } from "./timeline-scale";

export interface ResourceTimelineRowProps<TEvent> {
  /** The range's dates on the wall clock, for hour rows' strips and keyboard drafts. */
  readonly columns: readonly TimeGridColumn[];
  /** The cells of this row with a keyboard target: the focused one, and the entry in the first. */
  readonly cells: readonly CalendarCellFocus[];
  /** The calendar's locale and display time zone, for the resource's local time. */
  readonly environment: Pick<CalendarEnvironmentBase, "locale" | "timeZone">;
  /** A timed event's start time, shown on bars of a single day. */
  readonly formatTime: (instant: Temporal.Instant) => string;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
  readonly labelEvent: EventLabeler<TEvent>;
  readonly labels: TimelineLabels;
  /** The visible dates, for closed days in a day row. */
  readonly range: PlainDateInterval;
  /** Replaces the shading of closed time and closed days; see `UnavailableTimeRender`. */
  readonly renderUnavailable?: UnavailableTimeRender;
  readonly row: ResourceTimelineDayRow<TEvent> | ResourceTimelineHourRow<TEvent>;
  /** Width of each slot, in pixels. */
  readonly slotWidth: number;
  readonly slots: readonly TimelineSlot[];
  /** Length of a keyboard step in an hour row, in minutes. */
  readonly snapMinutes: number;
  readonly unit: TimelineSlotUnit;
  /** Where the row sits among all rows, and how tall it is. */
  readonly virtualRow: VirtualItem;
  /** The slots in view. */
  readonly visibleSlots: readonly VirtualItem[];
  readonly weekend: readonly IsoDayOfWeek[];
}

const HOURS = 24;
const noColumns: readonly TimeGridColumn[] = [];

function eventCount(count: number): string {
  return count === 0 ? "no events" : count === 1 ? "1 event" : `${count} events`;
}

/** A group's toggle; it re-renders only when that group expands or collapses. */
function ResourceToggle({ id, title }: { readonly id: ResourceId; readonly title: string }) {
  const { expanded, toggle } = useResourceExpansion(id);
  return (
    <Button
      aria-expanded={expanded}
      aria-label={`${expanded ? "Collapse" : "Expand"} ${title}`}
      onClick={toggle}
      size="icon-xs"
      // The grid keeps one tab stop; Shift+Enter on the group's cells toggles it.
      tabIndex={-1}
      variant="ghost"
    >
      <ChevronRightIcon
        className={cn("transition-transform", expanded ? "rotate-90" : "rtl:rotate-180")}
      />
    </Button>
  );
}

/**
 * A date's wall clock along an hour row, for the pointer layer (`data-axis="inline"`), with the
 * hours a clock change skips hatched and the hours it repeats tinted.
 */
function HourStrip({
  column,
  offset,
  width,
}: {
  readonly column: TimeGridColumn;
  readonly offset: number;
  readonly width: number;
}) {
  const band = ({ height, top }: { readonly height: number; readonly top: number }) => ({
    insetInlineStart: `${top * 100}%`,
    width: `${height * 100}%`,
  });
  return (
    <div
      data-axis="inline"
      data-date={column.date.toString()}
      className="absolute inset-y-0"
      style={{ insetInlineStart: offset, width }}
    >
      {column.gaps.map((gap) => (
        <div
          key={`gap:${gap.top}`}
          className="absolute inset-y-0 bg-[repeating-linear-gradient(45deg,transparent_0_5px,var(--calendar-grid)_5px_6px)]"
          style={band(gap)}
          title="Skipped: clocks moved forward"
        />
      ))}
      {column.folds.map((fold) => (
        <div
          key={`fold:${fold.top}`}
          className="absolute inset-y-0 bg-calendar-selection"
          style={band(fold)}
          title="Repeated: clocks moved back"
        />
      ))}
    </div>
  );
}

/** The focused cell's target, named after its row; a group's can expand and collapse it. */
function CellTarget({
  group,
  label,
  title,
  ...props
}: {
  readonly cell: CalendarCellFocus;
  readonly group: ResourceId | null;
  readonly label: string;
  readonly style: CSSProperties;
  readonly title: string;
}) {
  return group === null ? (
    <TimelineCellTarget {...props} label={`${title}, ${label}`} />
  ) : (
    <GroupCellTarget {...props} groupId={group} label={label} title={title} />
  );
}

function ResourceTimelineRowBase<TEvent>({
  cells,
  columns,
  environment,
  formatTime,
  getEventColor,
  labelEvent,
  labels,
  range,
  renderUnavailable,
  row,
  slotWidth,
  slots,
  snapMinutes,
  unit,
  virtualRow,
  visibleSlots,
  weekend,
}: ResourceTimelineRowProps<TEvent>) {
  const { resource } = row;
  const title = resource.resource?.title ?? "Unassigned";
  const bars = useMemo(() => rowBars(row, slots.length, formatTime), [formatTime, row, slots]);
  const placed = useMemo(
    () => placeBars(bars, slots, visibleSlots, slotWidth),
    [bars, slotWidth, slots, visibleSlots],
  );
  // An event with several resources shows in each row; its name says which one this is.
  const labelInRow = useCallback<EventLabeler<TEvent>>(
    (event) => labelEvent(event, title),
    [labelEvent, title],
  );
  const draft = useRowDraft(resource.id, columns, slots.length);
  const draftCheck = useDraftCheck();
  // The resource's own hours, on its own clock: shaded along an hour row, days muted in a day row.
  const closedTime = useTimelineAvailability(unit === "hour" ? columns : noColumns, resource.id);
  const closedDays = useClosedDates(range, resource.id);
  const shaded = useMemo(
    () => (unit === "hour" ? closedTime : closedDayExtents(closedDays, range)),
    [closedDays, closedTime, range, unit],
  );
  const localTime = useResourceTime(environment, resource.resource?.timeZone);
  const perDay = unit === "hour" ? HOURS : 1;
  const origin = slots[0]?.date;
  const slotOf = (cell: CalendarCellFocus) =>
    origin === undefined
      ? -1
      : origin.until(cell.date).days * perDay +
        (unit === "hour" && cell.kind === "slot" ? cell.time.hour : 0);
  const draftSlot =
    draft === null ? undefined : anchorSlot(visibleSlots, ...slotsCovered(...draft));
  /**
   * What a name says about working hours over `[from, to)`, in slots: "closed" for a day of a day
   * row, "outside working hours" for time of an hour row.
   */
  const availabilityNote = (date: Temporal.PlainDate, from: number, to: number) => {
    if (unit === "day") return closedDays.has(date.toString()) ? "closed" : undefined;
    return isUnavailableIn(closedTime, from / slots.length, to / slots.length)
      ? "outside working hours"
      : undefined;
  };
  /** A keyboard target's name: its cell, then what working hours say about it. */
  const targetLabel = (cell: CalendarCellFocus) => {
    const from =
      slotOf(cell) + (unit === "hour" && cell.kind === "slot" ? cell.time.minute / 60 : 0);
    const to =
      unit === "hour" && cell.kind === "slot" ? from + snapMinutes / 60 : slotOf(cell) + perDay;
    const note = availabilityNote(cell.date, from, to);
    return note === undefined ? labels.cellName(cell) : `${labels.cellName(cell)}, ${note}`;
  };

  return (
    <div
      role="row"
      aria-label={title}
      aria-rowindex={virtualRow.index + 2}
      {...resourceIdAttributes(resource.id)}
      className={cn(
        "absolute inset-x-0 flex border-b border-calendar-grid",
        resource.hasChildren && "bg-muted/50",
      )}
      style={{ height: virtualRow.size, top: virtualRow.start }}
    >
      <div
        role="rowheader"
        aria-colindex={1}
        aria-label={localTime === null ? title : `${title}, local time ${localTime}`}
        // Cells scroll beneath it, so the pointer layer doesn't look through it to them.
        data-occludes=""
        className={cn(
          "sticky start-0 z-30 flex w-(--calendar-resource-column) shrink-0 items-center gap-1 border-e border-calendar-grid bg-background pe-2 text-sm",
          resource.hasChildren && "bg-muted font-medium",
        )}
        style={{ paddingInlineStart: `${0.25 + resource.depth}rem` }}
      >
        {resource.hasChildren && resource.id !== null ? (
          <ResourceToggle id={resource.id} title={title} />
        ) : (
          <span aria-hidden className="size-6 shrink-0" />
        )}
        <span className="truncate">{title}</span>
        <ResourceTime
          className="ms-auto"
          environment={environment}
          timeZone={resource.resource?.timeZone}
        />
      </div>
      <TimelineAvailability
        days={range.start.until(range.end).days}
        extents={shaded}
        origin={range.start}
        render={renderUnavailable}
        resource={resource.resource}
        width={slots.length * slotWidth}
      />
      {visibleSlots.map((item, position) => {
        const slot = slots[item.index]!;
        const count = bars.filter(
          ({ end, start }) => start < item.index + 1 && end > item.index,
        ).length;
        // An hour row's date strip sits in the first rendered cell of that date.
        const dateIndex = Math.floor(item.index / perDay);
        const dateStart = dateIndex * perDay;
        const previous = visibleSlots[position - 1];
        const strip =
          unit === "hour" && (previous === undefined || previous.index < dateStart)
            ? columns[dateIndex]
            : undefined;
        const note = availabilityNote(slot.date, item.index, item.index + 1);
        return (
          <div
            key={item.key}
            role="gridcell"
            aria-colindex={item.index + 2}
            aria-label={[title, labels.slotName(slot), note, eventCount(count)]
              .filter((part) => part !== undefined)
              .join(", ")}
            data-closed={unit === "day" && note !== undefined ? "" : undefined}
            data-weekend={
              unit === "day" &&
              note === undefined &&
              weekend.includes(slot.date.dayOfWeek as IsoDayOfWeek)
                ? ""
                : undefined
            }
            className="absolute inset-y-0 border-s border-calendar-grid data-weekend:bg-calendar-weekend"
            style={{ insetInlineStart: item.start, width: item.size }}
          >
            {/* The day the pointer is over. Bars sit beside it, not in it, so grabbing a bar by a
                later day finds that day rather than the one whose cell holds the bar. */}
            {unit === "day" && (
              <div data-date={slot.date.toString()} className="absolute inset-0" />
            )}
            {strip !== undefined && (
              <HourStrip
                column={strip}
                offset={(dateStart - item.index) * slotWidth}
                width={perDay * slotWidth}
              />
            )}
            {draft !== null && draftSlot === item.index && (
              <div
                aria-hidden
                data-slot="resource-timeline-draft"
                {...previewCheckAttributes(draftCheck)}
                className={cn(
                  "pointer-events-none absolute inset-y-1 rounded-sm bg-calendar-selection",
                  draftCheckClassName,
                )}
                style={{
                  insetInlineStart: (draft[0] - item.index) * slotWidth,
                  width: (draft[1] - draft[0]) * slotWidth,
                }}
              />
            )}
            {placed.get(item.index)?.map((bar) => (
              <ResourceTimelineEvent
                key={`${typeof bar.event.id}:${bar.event.id}`}
                bar={bar}
                color={getEventColor?.(bar.event.event)}
                labelEvent={labelInRow}
                resourceId={resource.id}
              />
            ))}
            {cells
              .filter((cell) => slotOf(cell) === item.index)
              .map((cell) => (
                <CellTarget
                  key={`${cell.kind}:${cell.date.toString()}${cell.kind === "slot" ? `T${cell.time.toString()}` : ""}`}
                  cell={cell}
                  group={resource.hasChildren ? resource.id : null}
                  label={targetLabel(cell)}
                  style={
                    unit === "hour" && cell.kind === "slot"
                      ? {
                          insetInlineStart: (cell.time.minute / 60) * slotWidth,
                          width: (snapMinutes / 60) * slotWidth,
                        }
                      : { insetInlineStart: 0, width: perDay * slotWidth }
                  }
                  title={title}
                />
              ))}
          </div>
        );
      })}
    </div>
  );
}

/**
 * One resource: its name in the sticky resource column, indented by depth, with a toggle when it
 * has children, then a cell for each slot in view holding the bars that start there. Group rows
 * are tinted.
 */
export const ResourceTimelineRow = memo(ResourceTimelineRowBase) as typeof ResourceTimelineRowBase;
