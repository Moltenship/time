// #region presence
import { useResourceStatus } from "@moltenship/calendar-solid";
import { Show } from "solid-js";

// Render it inside the calendar's root.
export function Presence(props: { id: string }) {
  const status = useResourceStatus(() => props.id);

  return (
    <Show when={status()}>
      {(current) => (
        <span>
          {current().busy.busy
            ? "In a meeting"
            : current().availability.available
              ? "Around"
              : "Away"}
        </span>
      )}
    </Show>
  );
}
// #endregion presence
