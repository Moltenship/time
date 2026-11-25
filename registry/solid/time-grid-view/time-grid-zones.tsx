import type {
  CalendarEnvironmentBase,
  PlainDateInterval,
  TimeGridColumn,
} from "@moltenship/calendar-solid";
import type { JSX } from "@solidjs/web";
import { createMemo, For, Show, type Accessor } from "solid-js";

import {
  gutterStyle as zonesGutterStyle,
  timeGridZones,
  zoneHourFormats,
  zoneHourLabels,
  type TimeGridZone,
  type TimeGridZoneNote,
} from "@registry/shared/time-grid-view/secondary-zones";
import {
  gutterOffsetClass,
  zoneDayOffsetClass,
  zoneHourLabelClass,
  zoneHoursClass,
  zoneLabelClass,
  zoneNoteClass,
  zoneNotesClass,
} from "@registry/shared/time-grid-view/time-grid.styles";

export {
  describeZoneTimes,
  gutterColumn,
  zoneNotesByDate,
  zoneTimeFormat,
} from "@registry/shared/time-grid-view/secondary-zones";
export type {
  TimeGridZone,
  TimeGridZoneNote,
} from "@registry/shared/time-grid-view/secondary-zones";
export { timeGridGutterClassName } from "@registry/shared/time-grid-view/time-grid.styles";

/** Widens the gutter by a column per secondary zone; see `timeGridGutterClassName`. */
export function gutterStyle(zones: readonly TimeGridZone[]): JSX.CSSProperties | undefined {
  return zonesGutterStyle(zones);
}

/**
 * The root's secondary time zones over a grid's columns, as an accessor. Each zone's axis is read
 * on the first of the `visible` dates (all the columns by default) on which neither zone changes
 * its clocks.
 */
export function useTimeGridZones(
  environment: Accessor<CalendarEnvironmentBase>,
  columns: Accessor<readonly TimeGridColumn[]>,
  visible?: Accessor<PlainDateInterval | undefined>,
): Accessor<readonly TimeGridZone[]> {
  return createMemo(() => {
    const { locale, secondaryTimeZones } = environment();
    return timeGridZones({ locale, secondaryTimeZones }, columns(), visible?.());
  });
}

/**
 * A secondary zone's hour labels on the display zone's lines, over the full height of the element
 * around them: its time at each line, with "+1" or "-1" where it's on another date. A skipped hour
 * has no label, and a repeated one shows its earlier time. Hidden from assistive technology like
 * the display zone's hours; focused slots name their time in each zone instead.
 */
export function TimeGridZoneHours(props: {
  readonly class?: string;
  readonly locale: Intl.LocalesArgument;
  readonly zone: TimeGridZone;
}) {
  const formats = createMemo(() => zoneHourFormats(props.locale));
  const labels = createMemo(() => zoneHourLabels(props.zone, formats()));

  return (
    <div
      aria-hidden="true"
      data-slot="time-grid-zone-hours"
      data-time-zone={props.zone.timeZone}
      class={zoneHoursClass(props.class)}
    >
      <For each={labels()} keyed={(label) => label.top}>
        {(label) => (
          <span class={zoneHourLabelClass} style={{ top: label().topStyle }} title={label().title}>
            {label().label}
            <Show when={label().dayOffset}>
              {(offset) => (
                <span data-day-offset="" class={zoneDayOffsetClass}>
                  {offset()}
                </span>
              )}
            </Show>
          </span>
        )}
      </For>
    </div>
  );
}

/**
 * The gutter's header labels: each secondary zone's name over its hours, then the display zone's
 * offset over its own. Zone names are hidden from assistive technology, like their hours.
 */
export function TimeGridGutterLabels(props: {
  /** The display zone's offset, such as "GMT+2". */
  readonly offset: string | undefined;
  readonly zones: readonly TimeGridZone[];
}) {
  return (
    <>
      <For each={props.zones}>
        {(zone) => (
          <span
            aria-hidden="true"
            data-slot="time-grid-zone-label"
            class={zoneLabelClass}
            title={zone.name}
          >
            {zone.label}
          </span>
        )}
      </For>
      <span class={gutterOffsetClass}>{props.offset}</span>
    </>
  );
}

/** A day's notes under its date, where its times in a secondary zone differ from the gutter's. */
export function TimeGridZoneNotes(props: {
  readonly class?: string;
  readonly notes: readonly TimeGridZoneNote[] | undefined;
}) {
  return (
    <Show when={props.notes !== undefined && props.notes.length > 0}>
      <span aria-hidden="true" data-slot="time-grid-zone-note" class={zoneNotesClass(props.class)}>
        <For each={props.notes}>
          {(note) => (
            <span class={zoneNoteClass} title={note.title}>
              {note.text}
            </span>
          )}
        </For>
      </span>
    </Show>
  );
}
