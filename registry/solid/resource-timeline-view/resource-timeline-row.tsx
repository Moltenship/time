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
} from "@moltenship/calendar-solid";
import type { JSX } from "@solidjs/web";
import type { VirtualItem } from "@tanstack/virtual-core";
import { createMemo, For, Show } from "solid-js";

import type { EventLabeler } from "@registry/calendar/event-label";
import {
  draftCheckClassName,
  previewCheckAttributes,
  useDraftCheck,
} from "@registry/calendar/preview-check";
import {
  draftStatusAttributes,
  ResourceStatusPart,
  useResourceHeaderStatus,
  type ResourceStatusOptions,
} from "@registry/calendar/resource-status";
import { ResourceTime, useResourceTime } from "@registry/calendar/resource-time";
import type { UnavailableTimeRender } from "@registry/calendar/unavailable-time";
import { Button } from "@registry/calendar-ui/button";
import { ChevronRightIcon } from "@registry/calendar-ui/icons";
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
  boxStyle,
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

import { TimelineAvailability } from "./resource-timeline-availability";
import { ResourceTimelineEvent } from "./resource-timeline-event";
import { GroupCellTarget, TimelineCellTarget, useRowDraft } from "./resource-timeline-focus";

type Environment = Pick<CalendarEnvironmentBase, "locale" | "timeZone">;
type TimelineRow<TEvent> = ResourceTimelineDayRow<TEvent> | ResourceTimelineHourRow<TEvent>;

export interface ResourceTimelineRowProps<TEvent> {
  /** The range's dates on the wall clock, for hour rows' strips and keyboard drafts. */
  readonly columns: readonly TimeGridColumn[];
  /** The cells of this row with a keyboard target: the focused one, and the entry in the first. */
  readonly cells: readonly CalendarCellFocus[];
  /** The calendar's locale and display time zone, for the resource's local time. */
  readonly environment: Environment;
  /** A timed event's start time, shown on bars of a single day. */
  readonly formatTime: (instant: Temporal.Instant) => string;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
  /** An icon before an event's title, or nothing. */
  readonly getEventIcon?: (event: TEvent) => JSX.Element;
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
  readonly row: TimelineRow<TEvent>;
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

/** A group's toggle; it updates only when that group expands or collapses. */
function ResourceToggle(props: { readonly id: ResourceId; readonly title: string }) {
  const { expanded, toggle } = useResourceExpansion(() => props.id);
  return (
    <Button
      aria-expanded={expanded() ? "true" : "false"}
      aria-label={resourceToggleLabel(expanded(), props.title)}
      onClick={(event) => toggle(event)}
      size="icon-xs"
      // The grid keeps one tab stop; Shift+Enter on the group's cells toggles it.
      tabindex={-1}
      variant="ghost"
    >
      <ChevronRightIcon aria-hidden="true" class={timelineToggleIconClass(expanded())} />
    </Button>
  );
}

/**
 * The sticky resource cell: a group's toggle, the name, the local time for a resource on another
 * clock, and its status when the view shows it. Its name says all of them. Groups show no status:
 * their own bookings aren't their members'.
 */
function RowHeader<TEvent>(props: {
  readonly environment: Environment;
  readonly options: ResourceStatusOptions | null;
  readonly row: TimelineRow<TEvent>;
  readonly title: string;
}) {
  const resource = () => props.row.resource;
  const timeZone = () => resource().resource?.timeZone;
  const localTime = useResourceTime(() => props.environment, timeZone);
  const status = useResourceHeaderStatus(
    () => props.environment,
    resource,
    () => props.options,
  );
  const group = () => (resource().hasChildren ? resource().id : null);

  return (
    <div
      role="rowheader"
      aria-colindex={1}
      aria-label={rowHeaderLabel(props.title, localTime(), status()?.summary?.text)}
      {...draftStatusAttributes(status())}
      // Cells scroll beneath it, so the pointer layer doesn't look through it to them.
      data-occludes=""
      class={timelineRowHeaderClass(resource().hasChildren)}
      style={{ "padding-inline-start": `${0.25 + resource().depth}rem` }}
    >
      <Show
        when={group() !== null}
        fallback={<span aria-hidden="true" class={timelineToggleSpaceClass} />}
      >
        <ResourceToggle id={group()!} title={props.title} />
      </Show>
      <Show
        when={status()}
        fallback={
          <>
            <span class={timelineRowTitleClass}>{props.title}</span>
            <ResourceTime
              class={timelineRowTimeClass}
              environment={props.environment}
              timeZone={timeZone()}
            />
          </>
        }
      >
        {(current) => (
          <span class={timelineRowStackClass}>
            <span class={timelineRowStackTitleClass}>{props.title}</span>
            {/* The badge keeps its words; the local time gives way, and the name says both. */}
            <span class={timelineRowStatusLineClass}>
              <ResourceStatusPart class={timelineRowStatusClass} status={current()} />
              <ResourceTime
                aria-hidden="true"
                class={timelineRowStatusTimeClass}
                environment={props.environment}
                timeZone={timeZone()}
              />
            </span>
          </span>
        )}
      </Show>
    </div>
  );
}

/**
 * A date's wall clock along an hour row, for the pointer layer (`data-axis="inline"`), with the
 * hours a clock change skips hatched and the hours it repeats tinted.
 */
function HourStrip(props: {
  readonly column: TimeGridColumn;
  readonly offset: number;
  readonly width: number;
}) {
  return (
    <div
      data-axis="inline"
      data-date={props.column.date.toString()}
      class={timelineStripClass}
      style={boxStyle({ insetInlineStart: props.offset, width: props.width })}
    >
      <For each={props.column.gaps} keyed={(gap) => `gap:${gap.top}`}>
        {(gap) => (
          <div
            class={timelineGapClass}
            style={boxStyle(stripBand(gap()))}
            title={skippedHoursTitle}
          />
        )}
      </For>
      <For each={props.column.folds} keyed={(fold) => `fold:${fold.top}`}>
        {(fold) => (
          <div
            class={timelineFoldClass}
            style={boxStyle(stripBand(fold()))}
            title={repeatedHoursTitle}
          />
        )}
      </For>
    </div>
  );
}

const cellKey = (cell: CalendarCellFocus) =>
  `${cell.kind}:${cell.date.toString()}${cell.kind === "slot" ? `T${cell.time.toString()}` : ""}`;

/**
 * One resource: its name in the sticky resource column, indented by depth, with a toggle when it
 * has children, then a cell for each slot in view holding the bars that start there. Group rows
 * are tinted.
 */
export function ResourceTimelineRow<TEvent>(props: ResourceTimelineRowProps<TEvent>) {
  const resource = () => props.row.resource;
  const title = () => resourceRowTitle(resource().resource);
  const bars = createMemo(() => rowBars(props.row, props.slots.length, props.formatTime));
  const placed = createMemo(() =>
    placeBars(bars(), props.slots, props.visibleSlots, props.slotWidth),
  );
  // An event with several resources shows in each row; its name says which one this is.
  const labelInRow = createMemo<EventLabeler<TEvent>>(() => {
    const labelEvent = props.labelEvent;
    const row = title();
    return (event) => labelEvent(event, row);
  });
  const draft = useRowDraft(
    () => resource().id,
    () => props.columns,
    () => props.slots.length,
  );
  const draftCheck = useDraftCheck();
  // The resource's own hours, on its own clock: shaded along an hour row, days muted in a day row.
  const closedTime = useTimelineAvailability(
    () => (props.unit === "hour" ? props.columns : noColumns),
    () => resource().id,
  );
  const closedDays = useClosedDates(
    () => props.range,
    () => resource().id,
  );
  const shaded = createMemo(() =>
    props.unit === "hour" ? closedTime() : closedDayExtents(closedDays(), props.range),
  );
  const slotOf = (cell: CalendarCellFocus) => cellSlot(props.slots[0]?.date, props.unit, cell);
  const draftSlot = createMemo(() => {
    const stretch = draft();
    return stretch === null
      ? undefined
      : anchorSlot(props.visibleSlots, ...slotsCovered(...stretch));
  });
  const noteFor = (date: Temporal.PlainDate, from: number, to: number) =>
    availabilityNote(props.unit, closedDays(), closedTime(), props.slots.length, date, from, to);
  const targetLabel = (cell: CalendarCellFocus) =>
    timelineTargetLabel(
      props.labels.cellName(cell),
      noteFor(cell.date, ...cellStretch(slotOf(cell), props.unit, cell, props.snapMinutes)),
    );
  const group = () => (resource().hasChildren ? resource().id : null);

  return (
    <div
      role="row"
      aria-label={title()}
      aria-rowindex={props.virtualRow.index + 2}
      {...resourceIdAttributes(resource().id)}
      class={timelineRowClass(resource().hasChildren)}
      style={boxStyle({ height: props.virtualRow.size, top: props.virtualRow.start })}
    >
      <RowHeader
        environment={props.environment}
        options={props.resourceStatus}
        row={props.row}
        title={title()}
      />
      <TimelineAvailability
        days={props.range.start.until(props.range.end).days}
        extents={shaded()}
        origin={props.range.start}
        render={props.renderUnavailable}
        resource={resource().resource}
        width={props.slots.length * props.slotWidth}
      />
      <For each={props.visibleSlots} keyed={(item) => item.key}>
        {(item, position) => {
          const slot = () => props.slots[item().index]!;
          const strip = () =>
            dateStrip(props.visibleSlots, position(), props.unit, props.columns, props.slotWidth);
          const note = () => noteFor(slot().date, item().index, item().index + 1);
          const weekend = () =>
            props.unit === "day" &&
            note() === undefined &&
            props.weekend.includes(slot().date.dayOfWeek as IsoDayOfWeek);
          const targets = () => props.cells.filter((cell) => slotOf(cell) === item().index);
          return (
            <div
              role="gridcell"
              aria-colindex={item().index + 2}
              aria-label={timelineCellLabel(
                title(),
                props.labels.slotName(slot()),
                note(),
                barsIn(bars(), item().index),
              )}
              data-closed={props.unit === "day" && note() !== undefined ? "" : undefined}
              data-weekend={weekend() ? "" : undefined}
              class={timelineCellClass}
              style={boxStyle({ insetInlineStart: item().start, width: item().size })}
            >
              {/* The day the pointer is over. Bars sit beside it, not in it, so grabbing a bar by a
                  later day finds that day rather than the one whose cell holds the bar. */}
              <Show when={props.unit === "day"}>
                <div data-date={slot().date.toString()} class={timelineDayLayerClass} />
              </Show>
              <Show when={strip()}>
                {(current) => (
                  <HourStrip
                    column={current().column}
                    offset={current().offset}
                    width={current().width}
                  />
                )}
              </Show>
              <Show when={draftSlot() === item().index ? draft() : null}>
                {(stretch) => (
                  <div
                    aria-hidden="true"
                    data-slot="resource-timeline-draft"
                    {...previewCheckAttributes(draftCheck())}
                    class={timelineDraftClass(draftCheckClassName)}
                    style={boxStyle(draftBox(stretch(), item().index, props.slotWidth))}
                  />
                )}
              </Show>
              <For
                each={placed().get(item().index) ?? []}
                keyed={(bar) => `${typeof bar.event.id}:${bar.event.id}`}
              >
                {(bar) => (
                  <ResourceTimelineEvent
                    bar={bar()}
                    color={props.getEventColor?.(bar().event.event)}
                    icon={props.getEventIcon?.(bar().event.event)}
                    isReadOnly={props.isReadOnly}
                    labelEvent={labelInRow()}
                    resourceId={resource().id}
                  />
                )}
              </For>
              <For each={targets()} keyed={cellKey}>
                {(cell) => {
                  const style = () =>
                    boxStyle(cellTargetBox(props.unit, cell(), props.slotWidth, props.snapMinutes));
                  return (
                    <Show
                      when={group() !== null}
                      fallback={
                        <TimelineCellTarget
                          cell={cell()}
                          label={cellTargetLabel(title(), targetLabel(cell()))}
                          style={style()}
                        />
                      }
                    >
                      <GroupCellTarget
                        cell={cell()}
                        groupId={group()!}
                        label={targetLabel(cell())}
                        style={style()}
                        title={title()}
                      />
                    </Show>
                  );
                }}
              </For>
            </div>
          );
        }}
      </For>
    </div>
  );
}
