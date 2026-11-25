import { iteratePlainDates, type PlainDateInterval } from "@moltenship/calendar";

/** What one column of the timeline spans: an hour of the wall clock, or a whole day. */
export type TimelineSlotUnit = "day" | "hour";

/** A column of the timeline. */
export interface TimelineSlot {
  /** The date the slot falls on. */
  readonly date: Temporal.PlainDate;
  /** Stable across ranges: the slot's wall-clock start, such as `2026-10-08T09:00:00`. */
  readonly key: string;
  /** Wall-clock start; midnight for a day slot. */
  readonly start: Temporal.PlainDateTime;
}

/** Consecutive slots under one label in the header's upper row: a date, or a month. */
export interface TimelineSlotGroup {
  readonly count: number;
  /** Index of the group's first slot. */
  readonly first: number;
  /** The group's first slot's date. */
  readonly date: Temporal.PlainDate;
  readonly key: string;
}

/** Hours of the nominal wall-clock day, as the time grid draws it. */
const HOURS = Array.from({ length: 24 }, (_, hour) => new Temporal.PlainTime(hour));

/** The columns of a range: 24 nominal hours per date, or one per date. */
export function timelineSlots(
  range: PlainDateInterval,
  unit: TimelineSlotUnit,
): readonly TimelineSlot[] {
  const slots: TimelineSlot[] = [];
  for (const date of iteratePlainDates(range)) {
    for (const time of unit === "hour" ? HOURS : [HOURS[0]!]) {
      const start = date.toPlainDateTime(time);
      slots.push({ date, key: start.toString(), start });
    }
  }
  return slots;
}

/** Runs of slots that share a date (for hours) or a month (for days). */
export function timelineSlotGroups(
  slots: readonly TimelineSlot[],
  unit: TimelineSlotUnit,
): readonly TimelineSlotGroup[] {
  const groupKey = ({ date }: TimelineSlot) =>
    unit === "hour" ? date.toString() : date.toPlainYearMonth().toString();
  const groups: TimelineSlotGroup[] = [];
  slots.forEach((slot, index) => {
    const key = groupKey(slot);
    const last = groups.at(-1);
    if (last?.key === key) {
      groups[groups.length - 1] = { ...last, count: last.count + 1 };
    } else {
      groups.push({ count: 1, date: slot.date, first: index, key });
    }
  });
  return groups;
}
