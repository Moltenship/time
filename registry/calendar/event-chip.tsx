import type { ComponentProps } from "react";

import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import { cn } from "@registry/lib/utils";

export interface EventChipProps extends ComponentProps<"button"> {
  /** Sets `data-color`; without it the chip uses the theme's default event tokens. */
  readonly color?: CalendarEventColor;
}

/** Base event surface shared by every view: tinted fill, accent edge, readable text. */
export function EventChip({ className, color, type = "button", ...props }: EventChipProps) {
  return (
    <button
      data-slot="calendar-event"
      data-color={color}
      type={type}
      className={cn(
        "flex min-w-0 items-center gap-1.5 overflow-hidden rounded-md border-l-3 border-calendar-event-border bg-calendar-event px-2 py-1 text-left text-xs leading-tight font-medium text-calendar-event-foreground transition-[filter,box-shadow] outline-none hover:brightness-[0.97] focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:hover:brightness-110",
        className,
      )}
      {...props}
    />
  );
}
