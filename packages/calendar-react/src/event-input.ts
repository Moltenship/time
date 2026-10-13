import type { CalendarEventInput, CalendarEventSource } from "@moltenship/calendar-core";
import { useMemo, useSyncExternalStore } from "react";

const readNothing = () => null;
const subscribeToNothing = () => () => undefined;

function isEventSource<TEvent>(
  input: CalendarEventInput<TEvent>,
): input is CalendarEventSource<TEvent> {
  return !Array.isArray(input);
}

/**
 * The events `Root` shows: an array as given, or a source's current array. A source is read
 * through `useSyncExternalStore`, so its updates render the calendar and not the component that
 * renders `Root`; the server and hydration read `getServerSnapshot`.
 */
export function useEventInput<TEvent>(input: CalendarEventInput<TEvent>): readonly TEvent[] {
  const source = isEventSource(input) ? input : undefined;
  // The source's members are called as methods, so a class instance works too. A new source
  // subscribes again; an array subscribes to nothing. Stable getters spare React a second read
  // after every render.
  const { read, readServer, subscribe } = useMemo(
    () =>
      source === undefined
        ? { read: readNothing, readServer: readNothing, subscribe: subscribeToNothing }
        : {
            read: () => source.getSnapshot(),
            readServer: () => source.getServerSnapshot(),
            subscribe: (listener: () => void) => source.subscribe(listener),
          },
    [source],
  );
  const sourced = useSyncExternalStore(subscribe, read, readServer);
  return source === undefined ? (input as readonly TEvent[]) : (sourced as readonly TEvent[]);
}
