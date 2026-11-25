import { useNow, type CalendarEnvironmentBase } from "@moltenship/calendar-solid";
import type { JSX } from "@solidjs/web";
import { createMemo, omit, Show, type Accessor } from "solid-js";

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

type Environment = Pick<CalendarEnvironmentBase, "locale" | "timeZone">;

export interface ResourceTimeProps extends Omit<JSX.HTMLAttributes<HTMLSpanElement>, "children"> {
  /** The calendar's locale and display time zone. */
  readonly environment: Environment;
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
  environment: Accessor<Environment>,
  timeZone: Accessor<string | undefined>,
): Accessor<string | null> {
  const now = useNow();
  const clock = createMemo(() => resourceClock(environment().locale, timeZone()));
  return createMemo(() => {
    const instant = now();
    const current = clock();
    if (instant === null || current === null) return null;
    return resourceTimeText(current, instant, environment().timeZone);
  });
}

/** `useResourceTime` as small print, which screen readers hear as "local time". */
export function ResourceTime(props: ResourceTimeProps) {
  const rest = omit(props, "class", "environment", "separator", "timeZone");
  const time = useResourceTime(
    () => props.environment,
    () => props.timeZone,
  );

  return (
    <Show when={time()}>
      {(text) => (
        <span data-slot="resource-time" class={cn(resourceTimeClass, props.class)} {...rest}>
          <span class={resourceTimeWordsClass}>{localTimeWords(props.separator === true)}</span>
          {text()}
        </span>
      )}
    </Show>
  );
}
