import type { CalendarCellFocus } from "@moltenship/calendar";
import { useMemo } from "react";

import type { TimelineSlot, TimelineSlotGroup, TimelineSlotUnit } from "./timeline-scale";

export interface TimelineLabels {
  /** The keyboard's cell in full: a day, "Monday, October 5, 2026", or a slot, with its time. */
  readonly cellName: (cell: CalendarCellFocus) => string;
  /** The header's upper row: "Thursday, October 8, 2026" over hours, "October 2026" over days. */
  readonly group: (group: TimelineSlotGroup) => string;
  /** A slot's header: "9 AM" (or "09:00"), or "Mon" over the day number. */
  readonly slot: (slot: TimelineSlot) => string;
  /** A slot in full, for accessible names: "Thursday, October 8, 9:00 AM" or "Monday, October 5, 2026". */
  readonly slotName: (slot: TimelineSlot) => string;
}

/** "1 PM" where the locale uses a 12-hour clock, "13:00" where it uses 24 hours. */
function hourFormat(locale: Intl.LocalesArgument): Intl.DateTimeFormat {
  const hours = new Intl.DateTimeFormat(locale, { hour: "numeric" });
  const { hourCycle } = hours.resolvedOptions();
  return hourCycle === "h11" || hourCycle === "h12"
    ? hours
    : new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" });
}

/** The header's and cells' words for a timeline's slots, in the calendar's locale. */
export function useTimelineLabels(
  locale: Intl.LocalesArgument,
  unit: TimelineSlotUnit,
): TimelineLabels {
  return useMemo(() => {
    const fullDate = new Intl.DateTimeFormat(locale, { dateStyle: "full" });
    if (unit === "day") {
      const month = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });
      const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" });
      return {
        cellName: ({ date }) => fullDate.format(date),
        group: ({ date }) => month.format(date),
        slot: ({ date }) => weekday.format(date),
        slotName: ({ date }) => fullDate.format(date),
      };
    }
    const hour = hourFormat(locale);
    const dateTime = new Intl.DateTimeFormat(locale, {
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      month: "long",
      weekday: "long",
    });
    return {
      cellName: (cell) =>
        cell.kind === "slot"
          ? dateTime.format(cell.date.toPlainDateTime(cell.time))
          : fullDate.format(cell.date),
      group: ({ date }) => fullDate.format(date),
      slot: ({ start }) => hour.format(start.toPlainTime()),
      slotName: ({ start }) => dateTime.format(start),
    };
  }, [locale, unit]);
}
