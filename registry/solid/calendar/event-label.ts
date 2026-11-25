import type { CalendarEnvironmentBase } from "@moltenship/calendar-solid";
import { createMemo, type Accessor } from "solid-js";

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
 * An accessor, new when the locale, time zone or `describe` changes. The English words live in
 * `event-names.ts`; edit or translate them there.
 */
export function useEventLabel<TEvent>(
  where: Accessor<Pick<CalendarEnvironmentBase, "locale" | "timeZone">>,
  describe: Accessor<EventDescriber<TEvent> | undefined>,
): Accessor<EventLabeler<TEvent>> {
  return createMemo(() => {
    const { locale, timeZone } = where();
    return eventLabeler<TEvent>({ locale, timeZone }, describe());
  });
}
