"use client";

import { useNow, type CalendarEnvironmentBase } from "@moltenship/calendar";
import { useMemo, type ComponentProps } from "react";

import {
  localTimeWords,
  resourceClock,
  resourceTimeText,
} from "@registry/shared/calendar/resource-clock";
import {
  resourceTimeClass,
  resourceTimeWordsClass,
} from "@registry/shared/calendar/resource-time.styles";
import { cn } from "cn";

export interface ResourceTimeProps extends Omit<ComponentProps<"span">, "children"> {
  /** The calendar's locale and display time zone. */
  readonly environment: Pick<CalendarEnvironmentBase, "locale" | "timeZone">;
  /** The resource's own time zone, if it keeps one. */
  readonly timeZone: string | undefined;
  /** Reads a comma before it, after a name it follows in an accessible name. */
  readonly separator?: boolean;
}

/**
 * A resource's local time and UTC offset, "3:05 PM GMT+1", while its clock differs from the
 * display time zone's; `null` while server rendering, or for a resource on the display clock.
 */
export function useResourceTime(
  environment: Pick<CalendarEnvironmentBase, "locale" | "timeZone">,
  timeZone: string | undefined,
): string | null {
  const now = useNow();
  const clock = useMemo(
    () => resourceClock(environment.locale, timeZone),
    [environment.locale, timeZone],
  );
  if (now === null || clock === null) return null;
  return resourceTimeText(clock, now, environment.timeZone);
}

/** `useResourceTime` as small print, which screen readers hear as "local time". */
export function ResourceTime({
  className,
  environment,
  separator = false,
  timeZone,
  ...props
}: ResourceTimeProps) {
  const time = useResourceTime(environment, timeZone);
  if (time === null) return null;

  return (
    <span data-slot="resource-time" className={cn(resourceTimeClass, className)} {...props}>
      <span className={resourceTimeWordsClass}>{localTimeWords(separator)}</span>
      {time}
    </span>
  );
}
