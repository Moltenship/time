import type { ComponentProps } from "react";

import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import { cn } from "cn";

export interface EventChipProps extends ComponentProps<"button"> {
  /** Sets `data-color`; without it the chip uses the theme's default event tokens. */
  readonly color?: CalendarEventColor;
  /** A change to the event is still being saved: the chip is dimmed and marked busy. */
  readonly pending?: boolean;
}

/** Base event surface shared by every view: tinted fill, accent edge, readable text. */
export function EventChip({
  className,
  color,
  pending = false,
  type = "button",
  ...props
}: EventChipProps) {
  return (
    <button
      aria-busy={pending || undefined}
      data-slot="calendar-event"
      data-color={color}
      data-pending={pending ? "" : undefined}
      type={type}
      className={cn(
        // `data-dragging` marks the event a pointer drag is moving; its preview follows the pointer.
        "flex min-w-0 items-center gap-1.5 overflow-hidden rounded-md border-s-3 border-calendar-event-border bg-calendar-event px-2 py-1 text-start text-xs leading-tight font-medium text-calendar-event-foreground transition-[filter,box-shadow] hover:brightness-[0.97] focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring data-dragging:opacity-40 data-pending:opacity-60 dark:hover:brightness-110",
        className,
      )}
      {...props}
    />
  );
}
