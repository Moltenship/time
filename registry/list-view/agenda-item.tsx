import type { EventId, ListItem, ResourceId } from "@moltenship/calendar";

import { EventChip, useEventChip } from "@registry/calendar/event-chip";
import type { EventLabeler } from "@registry/calendar/event-label";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";

export interface AgendaItemProps<TEvent> {
  readonly color?: CalendarEventColor;
  readonly item: ListItem<TEvent, EventId, ResourceId>;
  readonly labelEvent: EventLabeler<TEvent>;
  /** Opens the item's day; Shift+Enter on the item does so. */
  readonly onOpenDay: (date: Temporal.PlainDate) => void;
  readonly timeFormat: Intl.DateTimeFormat;
}

function timeLabel(
  { end, event, start, endsAfterDay, startsBeforeDay }: ListItem<unknown, EventId, ResourceId>,
  format: Intl.DateTimeFormat,
) {
  if (event.kind === "all-day" || (startsBeforeDay && endsAfterDay)) return undefined;
  if (startsBeforeDay) return `Until ${format.format(end.toPlainTime())}`;
  if (endsAfterDay) return `From ${format.format(start.toPlainTime())}`;
  return format.formatRange(start.toPlainTime(), end.toPlainTime());
}

/** One agenda row: time range or an "All day" badge, the title, and "Day k of n" for long events. */
export function AgendaItem<TEvent>({
  color,
  item,
  labelEvent,
  onOpenDay,
  timeFormat,
}: AgendaItemProps<TEvent>) {
  const time = timeLabel(item, timeFormat);
  const chip = useEventChip(item.event, { date: item.date, labelEvent });

  return (
    <EventChip
      color={color}
      {...chip}
      onKeyDown={(event) => {
        // Shift+Enter opens the item's day, as clicking its date does.
        if (event.key === "Enter" && event.shiftKey) {
          event.preventDefault();
          onOpenDay(item.date);
        }
      }}
      className="w-full gap-x-3 gap-y-0.5 border-s-0 bg-transparent py-1.5 text-sm font-normal text-foreground hover:bg-accent hover:brightness-100 max-sm:flex-col max-sm:items-start"
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
