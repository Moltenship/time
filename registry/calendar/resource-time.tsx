import { useNow, type CalendarEnvironmentBase } from "@moltenship/calendar";
import { useMemo, type ComponentProps } from "react";

import { cn } from "cn";

export interface ResourceTimeProps extends Omit<ComponentProps<"span">, "children"> {
  /** The calendar's locale and display time zone. */
  readonly environment: Pick<CalendarEnvironmentBase, "locale" | "timeZone">;
  /** The resource's own time zone, if it keeps one. */
  readonly timeZone: string | undefined;
}

function clockFor(locale: Intl.Locale | string, timeZone: string | undefined) {
  if (timeZone === undefined) return null;
  try {
    return {
      offset: new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: "shortOffset" }),
      time: new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone }),
      timeZone,
    };
  } catch {
    // An unknown time zone, which the root reports as a diagnostic.
    return null;
  }
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
    () => clockFor(environment.locale, timeZone),
    [environment.locale, timeZone],
  );
  if (now === null || clock === null) return null;
  const offsetIn = (zone: string) => now.toZonedDateTimeISO(zone).offsetNanoseconds;
  if (offsetIn(clock.timeZone) === offsetIn(environment.timeZone)) return null;
  const offset = clock.offset.formatToParts(now).find(({ type }) => type === "timeZoneName");
  return `${clock.time.format(now)} ${offset?.value ?? ""}`.trim();
}

/** `useResourceTime` as small print, which screen readers hear as "local time". */
export function ResourceTime({ className, environment, timeZone, ...props }: ResourceTimeProps) {
  const time = useResourceTime(environment, timeZone);
  if (time === null) return null;

  return (
    <span
      data-slot="resource-time"
      className={cn("shrink-0 text-[0.625rem] text-muted-foreground tabular-nums", className)}
      {...props}
    >
      <span className="sr-only">local time </span>
      {time}
    </span>
  );
}
