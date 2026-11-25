import type { CalendarEnvironmentBase } from "@moltenship/calendar";
import { useMemo } from "react";

import {
  eventLabeler,
  type EventDescriber,
  type EventLabeler,
} from "@registry/shared/calendar/event-names";

export { describeWhen, eventTitle } from "@registry/shared/calendar/event-names";
export type { EventDescriber, EventLabeler } from "@registry/shared/calendar/event-names";

/**
 * Accessible names for events: title, when, where, the view's `describeEvent` detail, and whether
 * a change is still saving, as in "Standup, Thursday, October 8, 9:00 – 9:30 AM, Work, saving".
 * The English words live in `event-names.ts`; edit or translate them there.
 */
export function useEventLabel<TEvent>(
  { locale, timeZone }: Pick<CalendarEnvironmentBase, "locale" | "timeZone">,
  describe: EventDescriber<TEvent> | undefined,
): EventLabeler<TEvent> {
  return useMemo(() => eventLabeler({ locale, timeZone }, describe), [describe, locale, timeZone]);
}
