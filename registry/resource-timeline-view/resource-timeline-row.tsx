"use client";

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
  type VisibleResource,
} from "@moltenship/calendar";
import type { VirtualItem } from "@tanstack/virtual-core";
import { ChevronRightIcon } from "lucide-react";
import { memo, useCallback, useMemo, type CSSProperties, type ReactNode } from "react";

import type { EventLabeler } from "@registry/calendar/event-label";
import {
  draftStatusAttributes,
  ResourceStatusPart,
  useResourceHeaderStatus,
  type ResourceHeaderStatusValue,
  type ResourceStatusOptions,
} from "@registry/calendar/resource-status";
import { ResourceTime, useResourceTime } from "@registry/calendar/resource-time";
import {
  draftCheckClassName,
  previewCheckAttributes,
  useDraftCheck,
} from "@registry/calendar/preview-check";
import type { UnavailableTimeRender } from "@registry/calendar/unavailable-time";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import {
  timelineCellClass,
  timelineDayLayerClass,
  timelineDraftClass,
  timelineFoldClass,
  timelineGapClass,
  timelineRowClass,
  timelineRowHeaderClass,
  timelineRowStackClass,
  timelineRowStackTitleClass,
  timelineRowStatusClass,
  timelineRowStatusLineClass,
  timelineRowStatusTimeClass,
  timelineRowTimeClass,
  timelineRowTitleClass,
  timelineStripClass,
  timelineToggleIconClass,
  timelineToggleSpaceClass,
} from "@registry/shared/resource-timeline-view/resource-timeline.styles";
import {
  availabilityNote,
  closedDayExtents,
} from "@registry/shared/resource-timeline-view/timeline-availability";
import {
  cellTargetLabel,
  repeatedHoursTitle,
  resourceRowTitle,
  resourceToggleLabel,
  rowHeaderLabel,
  skippedHoursTitle,
  timelineCellLabel,
  timelineTargetLabel,
  type TimelineLabels,
} from "@registry/shared/resource-timeline-view/timeline-labels";
import {
  anchorSlot,
  barsIn,
  cellSlot,
  cellStretch,
  cellTargetBox,
  dateStrip,
  draftBox,
  placeBars,
  rowBars,
  slotsCovered,
  stripBand,
} from "@registry/shared/resource-timeline-view/timeline-placement";
import type {
  TimelineSlot,
  TimelineSlotUnit,
} from "@registry/shared/resource-timeline-view/timeline-scale";
import { Button } from "@registry/calendar-ui/button";

import { TimelineAvailability } from "./resource-timeline-availability";
import { ResourceTimelineEvent } from "./resource-timeline-event";
import { GroupCellTarget, TimelineCellTarget, useRowDraft } from "./resource-timeline-focus";

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
  /** An icon before an event's title, or nothing. */
  readonly getEventIcon?: (event: TEvent) => ReactNode;
  /** The root takes no changes: events have no resize handles. */
  readonly isReadOnly?: boolean;
  readonly labelEvent: EventLabeler<TEvent>;
  readonly labels: TimelineLabels;
  /** The visible dates, for closed days in a day row. */
  readonly range: PlainDateInterval;
  /** Replaces the shading of closed time and closed days; see `UnavailableTimeRender`. */
  readonly renderUnavailable?: UnavailableTimeRender;
  /** How the row header shows the resource's status; `null` without it. */
  readonly resourceStatus: ResourceStatusOptions | null;
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

const noColumns: readonly TimeGridColumn[] = [];

/** A group's toggle; it re-renders only when that group expands or collapses. */
function ResourceToggle({ id, title }: { readonly id: ResourceId; readonly title: string }) {
  const { expanded, toggle } = useResourceExpansion(id);
  return (
    <Button
      aria-expanded={expanded}
      aria-label={resourceToggleLabel(expanded, title)}
      onClick={toggle}
      size="icon-xs"
      // The grid keeps one tab stop; Shift+Enter on the group's cells toggles it.
      tabIndex={-1}
      variant="ghost"
    >
      <ChevronRightIcon className={timelineToggleIconClass(expanded)} />
    </Button>
  );
}

interface RowHeaderProps {
  readonly environment: Pick<CalendarEnvironmentBase, "locale" | "timeZone">;
  readonly resource: VisibleResource;
  readonly title: string;
}

/**
 * The sticky resource cell: a group's toggle, the name, the local time for a resource on another
 * clock, and its status when the view shows it. Its name says all of them.
 */
function RowHeader({
  environment,
  resource,
  status,
  title,
}: RowHeaderProps & { readonly status: ResourceHeaderStatusValue | null }) {
  const localTime = useResourceTime(environment, resource.resource?.timeZone);
  const words = status?.summary?.text;
  return (
    <div
      role="rowheader"
      aria-colindex={1}
      aria-label={rowHeaderLabel(title, localTime, words)}
      {...draftStatusAttributes(status)}
      // Cells scroll beneath it, so the pointer layer doesn't look through it to them.
      data-occludes=""
      className={timelineRowHeaderClass(resource.hasChildren)}
      style={{ paddingInlineStart: `${0.25 + resource.depth}rem` }}
    >
      {resource.hasChildren && resource.id !== null ? (
        <ResourceToggle id={resource.id} title={title} />
      ) : (
        <span aria-hidden className={timelineToggleSpaceClass} />
      )}
      {status === null ? (
        <>
          <span className={timelineRowTitleClass}>{title}</span>
          <ResourceTime
            className={timelineRowTimeClass}
            environment={environment}
            timeZone={resource.resource?.timeZone}
          />
        </>
      ) : (
        <span className={timelineRowStackClass}>
          <span className={timelineRowStackTitleClass}>{title}</span>
          {/* The badge keeps its words; the local time gives way, and the name says both. */}
          <span className={timelineRowStatusLineClass}>
            <ResourceStatusPart className={timelineRowStatusClass} status={status} />
            <ResourceTime
              aria-hidden
              className={timelineRowStatusTimeClass}
              environment={environment}
              timeZone={resource.resource?.timeZone}
            />
          </span>
        </span>
      )}
    </div>
  );
}

/**
 * `RowHeader` with the resource's status, now and during a draft, so rows without it keep no
 * clock. Groups have none: their own bookings aren't their members'.
 */
function RowHeaderWithStatus({
  options,
  ...props
}: RowHeaderProps & { readonly options: ResourceStatusOptions }) {
  const status = useResourceHeaderStatus(props.environment, props.resource, options);
  return <RowHeader {...props} status={status} />;
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
  return (
    <div
      data-axis="inline"
      data-date={column.date.toString()}
      className={timelineStripClass}
      style={{ insetInlineStart: offset, width }}
    >
      {column.gaps.map((gap) => (
        <div
          key={`gap:${gap.top}`}
          className={timelineGapClass}
          style={stripBand(gap)}
          title={skippedHoursTitle}
        />
      ))}
      {column.folds.map((fold) => (
        <div
          key={`fold:${fold.top}`}
          className={timelineFoldClass}
          style={stripBand(fold)}
          title={repeatedHoursTitle}
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
    <TimelineCellTarget {...props} label={cellTargetLabel(title, label)} />
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
  getEventIcon,
  isReadOnly,
  labelEvent,
  labels,
  range,
  renderUnavailable,
  resourceStatus,
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
  const title = resourceRowTitle(resource.resource);
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
  const origin = slots[0]?.date;
  const slotOf = (cell: CalendarCellFocus) => cellSlot(origin, unit, cell);
  const draftSlot =
    draft === null ? undefined : anchorSlot(visibleSlots, ...slotsCovered(...draft));
  const noteFor = (date: Temporal.PlainDate, from: number, to: number) =>
    availabilityNote(unit, closedDays, closedTime, slots.length, date, from, to);
  const targetLabel = (cell: CalendarCellFocus) =>
    timelineTargetLabel(
      labels.cellName(cell),
      noteFor(cell.date, ...cellStretch(slotOf(cell), unit, cell, snapMinutes)),
    );

  return (
    <div
      role="row"
      aria-label={title}
      aria-rowindex={virtualRow.index + 2}
      {...resourceIdAttributes(resource.id)}
      className={timelineRowClass(resource.hasChildren)}
      style={{ height: virtualRow.size, top: virtualRow.start }}
    >
      {resourceStatus !== null && !resource.hasChildren ? (
        <RowHeaderWithStatus
          options={resourceStatus}
          environment={environment}
          resource={resource}
          title={title}
        />
      ) : (
        <RowHeader environment={environment} resource={resource} status={null} title={title} />
      )}
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
        const strip = dateStrip(visibleSlots, position, unit, columns, slotWidth);
        const note = noteFor(slot.date, item.index, item.index + 1);
        return (
          <div
            key={item.key}
            role="gridcell"
            aria-colindex={item.index + 2}
            aria-label={timelineCellLabel(
              title,
              labels.slotName(slot),
              note,
              barsIn(bars, item.index),
            )}
            data-closed={unit === "day" && note !== undefined ? "" : undefined}
            data-weekend={
              unit === "day" &&
              note === undefined &&
              weekend.includes(slot.date.dayOfWeek as IsoDayOfWeek)
                ? ""
                : undefined
            }
            className={timelineCellClass}
            style={{ insetInlineStart: item.start, width: item.size }}
          >
            {/* The day the pointer is over. Bars sit beside it, not in it, so grabbing a bar by a
                later day finds that day rather than the one whose cell holds the bar. */}
            {unit === "day" && (
              <div data-date={slot.date.toString()} className={timelineDayLayerClass} />
            )}
            {strip !== undefined && (
              <HourStrip column={strip.column} offset={strip.offset} width={strip.width} />
            )}
            {draft !== null && draftSlot === item.index && (
              <div
                aria-hidden
                data-slot="resource-timeline-draft"
                {...previewCheckAttributes(draftCheck)}
                className={timelineDraftClass(draftCheckClassName)}
                style={draftBox(draft, item.index, slotWidth)}
              />
            )}
            {placed.get(item.index)?.map((bar) => (
              <ResourceTimelineEvent
                key={`${typeof bar.event.id}:${bar.event.id}`}
                bar={bar}
                color={getEventColor?.(bar.event.event)}
                icon={getEventIcon?.(bar.event.event)}
                isReadOnly={isReadOnly}
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
                  style={cellTargetBox(unit, cell, slotWidth, snapMinutes)}
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
