import type { EventId, ListItem, ResourceId } from "@moltenship/calendar";

import { EventChip } from "@registry/calendar/event-chip";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";

export interface AgendaItemProps {
  readonly color?: CalendarEventColor;
  readonly item: ListItem<unknown, EventId, ResourceId>;
  /** Accessible name: title, when, and other details the visible text leaves out. */
  readonly label: string;
  readonly timeFormat: Intl.DateTimeFormat;
}

function timeLabel(
  { end, event, start, endsAfterDay, startsBeforeDay }: AgendaItemProps["item"],
  format: Intl.DateTimeFormat,
) {
  if (event.kind === "all-day" || (startsBeforeDay && endsAfterDay)) return undefined;
  if (startsBeforeDay) return `Until ${format.format(end.toPlainTime())}`;
  if (endsAfterDay) return `From ${format.format(start.toPlainTime())}`;
  return format.formatRange(start.toPlainTime(), end.toPlainTime());
}

/** One agenda row: time range or an "All day" badge, the title, and "Day k of n" for long events. */
export function AgendaItem({ color, item, label, timeFormat }: AgendaItemProps) {
  const time = timeLabel(item, timeFormat);

  return (
    <EventChip
      aria-label={label}
      color={color}
      data-event-id={String(item.event.id)}
      pending={item.event.isPending === true}
      className="w-full gap-x-3 gap-y-0.5 border-l-0 bg-transparent py-1.5 text-sm font-normal text-foreground hover:bg-accent hover:brightness-100 max-sm:flex-col max-sm:items-start"
    >
      <span className="flex shrink-0 items-center gap-2 sm:w-44">
        <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-calendar-event-border" />
        {time === undefined ? (
          <span className="rounded-full bg-calendar-event px-2 py-0.5 text-xs font-medium text-calendar-event-foreground">
            All day
          </span>
        ) : (
          <span className="text-muted-foreground tabular-nums max-sm:text-xs">{time}</span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 items-baseline gap-2 max-sm:w-full max-sm:pl-4.5">
        <span className="truncate font-medium">{item.event.title}</span>
        {item.dayCount > 1 && (
          <span className="shrink-0 text-xs text-muted-foreground">
            Day {item.dayIndex} of {item.dayCount}
          </span>
        )}
      </span>
    </EventChip>
  );
}
