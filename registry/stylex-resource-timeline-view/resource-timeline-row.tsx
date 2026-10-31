"use client";

import { IconButton } from "@astryxdesign/core/IconButton";
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
import * as stylex from "@stylexjs/stylex";
import type { VirtualItem } from "@tanstack/react-virtual";
import { ChevronRightIcon } from "lucide-react";
import { memo, useCallback, useMemo, type CSSProperties, type ReactNode } from "react";

import type { EventLabeler } from "@registry/stylex-calendar/event-label";
import {
  draftStatusAttributes,
  ResourceStatusPart,
  useResourceHeaderStatus,
  type ResourceHeaderStatusValue,
  type ResourceStatusOptions,
} from "@registry/stylex-calendar/resource-status";
import { ResourceTime, useResourceTime } from "@registry/stylex-calendar/resource-time";
import { previewCheckAttributes, useDraftCheck } from "@registry/stylex-calendar/preview-check";
import type { UnavailableTimeRender } from "@registry/stylex-calendar/unavailable-time";
import type { CalendarEventColor } from "@registry/stylex-calendar-theme/event-colors";
import {
  calendarConsts,
  calendarVars,
} from "@registry/stylex-calendar-theme/calendar-tokens.stylex";

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

const styles = stylex.create({
  band: {
    insetBlock: 0,
    position: "absolute",
  },
  cell: {
    backgroundColor: { default: null, "[data-weekend]": calendarVars["--calendar-weekend"] },
    borderInlineStartColor: calendarVars["--calendar-grid"],
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: 1,
    insetBlock: 0,
    position: "absolute",
  },
  cellDay: {
    inset: 0,
    position: "absolute",
  },
  draft: {
    backgroundColor: {
      default: calendarVars["--calendar-selection"],
      "[data-invalid]": `color-mix(in oklch, ${calendarVars["--calendar-invalid"]} 15%, transparent)`,
    },
    borderRadius: "calc(var(--radius) * 0.6)",
    insetBlock: "0.25rem",
    outlineColor: {
      default: null,
      "[data-invalid]": calendarVars["--calendar-invalid"],
      "[data-warning]": calendarVars["--calendar-warning"],
    },
    outlineOffset: { default: null, "[data-invalid]": -2, "[data-warning]": -2 },
    outlineStyle: { default: null, "[data-invalid]": "dashed", "[data-warning]": "dashed" },
    outlineWidth: { default: null, "[data-invalid]": 2, "[data-warning]": 2 },
    pointerEvents: "none",
    position: "absolute",
  },
  fold: {
    backgroundColor: calendarVars["--calendar-selection"],
  },
  gap: {
    backgroundImage: `repeating-linear-gradient(45deg, transparent 0 5px, ${calendarVars["--calendar-grid"]} 5px 6px)`,
  },
  names: {
    alignItems: "flex-start",
    display: "flex",
    flexDirection: "column",
    gap: "0.125rem",
    minWidth: 0,
  },
  row: {
    borderBottomColor: calendarVars["--calendar-grid"],
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "flex",
    insetInline: 0,
    position: "absolute",
  },
  rowGroup: {
    backgroundColor: `color-mix(in oklch, ${calendarVars["--muted"]} 50%, transparent)`,
  },
  rowHeader: {
    alignItems: "center",
    backgroundColor: calendarConsts.surface,
    borderInlineEndColor: calendarVars["--calendar-grid"],
    borderInlineEndStyle: "solid",
    borderInlineEndWidth: 1,
    display: "flex",
    flexShrink: 0,
    fontSize: "0.875rem",
    gap: "0.25rem",
    insetInlineStart: 0,
    lineHeight: "1.25rem",
    paddingInlineEnd: "0.5rem",
    position: "sticky",
    width: "var(--calendar-resource-column)",
    zIndex: 30,
  },
  rowHeaderGroup: {
    backgroundColor: calendarVars["--muted"],
    fontWeight: 500,
  },
  spacer: {
    flexShrink: 0,
    height: "1.5rem",
    width: "1.5rem",
  },
  statusLine: {
    alignItems: "center",
    display: "flex",
    gap: "0.25rem",
    maxWidth: "100%",
    minWidth: 0,
  },
  statusPart: {
    flexShrink: 0,
  },
  timeAfterName: {
    marginInlineStart: "auto",
  },
  timeAfterStatus: {
    flexShrink: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  title: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  titleOverStatus: {
    maxWidth: "100%",
  },
  toggle: {
    borderRadius: "min(calc(var(--radius) * 0.8), 10px)",
    height: "1.5rem",
    width: "1.5rem",
  },
  toggleIcon: {
    height: "0.75rem",
    transitionDuration: "150ms",
    transitionProperty: "transform, translate, scale, rotate",
    transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
    width: "0.75rem",
  },
  toggleIconCollapsed: {
    rotate: { default: null, ":dir(rtl)": "180deg" },
  },
  toggleIconExpanded: {
    rotate: "90deg",
  },
});

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

const HOURS = 24;
const noColumns: readonly TimeGridColumn[] = [];

function eventCount(count: number): string {
  return count === 0 ? "no events" : count === 1 ? "1 event" : `${count} events`;
}

/** A group's toggle; it re-renders only when that group expands or collapses. */
function ResourceToggle({ id, title }: { readonly id: ResourceId; readonly title: string }) {
  const { expanded, toggle } = useResourceExpansion(id);
  return (
    <IconButton
      aria-expanded={expanded}
      icon={
        <ChevronRightIcon
          {...stylex.props(
            styles.toggleIcon,
            expanded ? styles.toggleIconExpanded : styles.toggleIconCollapsed,
          )}
        />
      }
      label={`${expanded ? "Collapse" : "Expand"} ${title}`}
      onClick={toggle}
      size="sm"
      // The grid keeps one tab stop; Shift+Enter on the group's cells toggles it.
      tabIndex={-1}
      variant="ghost"
      xstyle={styles.toggle}
    />
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
      aria-label={[title, localTime === null ? undefined : `local time ${localTime}`, words]
        .filter((part) => part !== undefined)
        .join(", ")}
      {...draftStatusAttributes(status)}
      // Cells scroll beneath it, so the pointer layer doesn't look through it to them.
      data-occludes=""
      {...stylex.props(styles.rowHeader, resource.hasChildren && styles.rowHeaderGroup)}
      style={{ paddingInlineStart: `${0.25 + resource.depth}rem` }}
    >
      {resource.hasChildren && resource.id !== null ? (
        <ResourceToggle id={resource.id} title={title} />
      ) : (
        <span aria-hidden {...stylex.props(styles.spacer)} />
      )}
      {status === null ? (
        <>
          <span {...stylex.props(styles.title)}>{title}</span>
          <ResourceTime
            environment={environment}
            timeZone={resource.resource?.timeZone}
            xstyle={styles.timeAfterName}
          />
        </>
      ) : (
        <span {...stylex.props(styles.names)}>
          <span {...stylex.props(styles.title, styles.titleOverStatus)}>{title}</span>
          {/* The badge keeps its words; the local time gives way, and the name says both. */}
          <span {...stylex.props(styles.statusLine)}>
            <ResourceStatusPart status={status} xstyle={styles.statusPart} />
            <ResourceTime
              aria-hidden
              environment={environment}
              timeZone={resource.resource?.timeZone}
              xstyle={styles.timeAfterStatus}
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
  const band = ({ height, top }: { readonly height: number; readonly top: number }) => ({
    insetInlineStart: `${top * 100}%`,
    width: `${height * 100}%`,
  });
  return (
    <div
      data-axis="inline"
      data-date={column.date.toString()}
      {...stylex.props(styles.band)}
      style={{ insetInlineStart: offset, width }}
    >
      {column.gaps.map((gap) => (
        <div
          key={`gap:${gap.top}`}
          {...stylex.props(styles.band, styles.gap)}
          style={band(gap)}
          title="Skipped: clocks moved forward"
        />
      ))}
      {column.folds.map((fold) => (
        <div
          key={`fold:${fold.top}`}
          {...stylex.props(styles.band, styles.fold)}
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
      {...stylex.props(styles.row, resource.hasChildren && styles.rowGroup)}
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
            {...stylex.props(styles.cell)}
            style={{ insetInlineStart: item.start, width: item.size }}
          >
            {/* The day the pointer is over. Bars sit beside it, not in it, so grabbing a bar by a
                later day finds that day rather than the one whose cell holds the bar. */}
            {unit === "day" && (
              <div data-date={slot.date.toString()} {...stylex.props(styles.cellDay)} />
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
                {...stylex.props(styles.draft)}
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
