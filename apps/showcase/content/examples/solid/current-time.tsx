// #region now
import { useNow } from "@moltenship/calendar-solid";
import { Show } from "solid-js";

import { Calendar } from "./calendar";

export function CurrentTime() {
  const now = useNow({ intervalMs: 30_000 });
  const timeZone = Calendar.useCalendarSelector((state) => state.timeZone);

  return (
    <Show when={now()}>
      {(instant) => (
        <time datetime={instant().toString()}>
          {instant()
            .toZonedDateTimeISO(timeZone())
            .toPlainTime()
            .toString({ smallestUnit: "minute" })}
        </time>
      )}
    </Show>
  );
}
// #endregion now
