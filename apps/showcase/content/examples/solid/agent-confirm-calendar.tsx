// #region calendar
import { createSignal, onCleanup, Show } from "solid-js";

import { deleteRequest } from "./agent-confirm";
import { applyChange, timedOnly } from "./agent-save";
import { seed, weekRules } from "./app";
import { Calendar } from "./calendar";

export function ConfirmingCalendar() {
  const [meetings, setMeetings] = createSignal(seed);
  const titleOf = (eventId: string) =>
    meetings().find(({ id }) => id === eventId)?.title ?? `"${eventId}"`;
  // The calendar left the page with a question open: the answer is no.
  onCleanup(() => deleteRequest()?.answer(false));

  return (
    <>
      <Show when={deleteRequest()}>
        {(pending) => (
          <div role="alertdialog" aria-label="The agent asks to delete a meeting">
            <p>
              The agent wants to delete <strong>{titleOf(pending().eventId)}</strong>.
            </p>
            <button type="button" autofocus onClick={() => pending().answer(false)}>
              Keep it
            </button>
            <button type="button" onClick={() => pending().answer(true)}>
              Delete
            </button>
          </div>
        )}
      </Show>
      <Calendar.Root
        label="Team calendar"
        // Without this the calendar has no `deleteEvent` action, whatever `allow` answers.
        allowAgentDelete
        events={meetings()}
        onEventChange={(change, detail) => {
          setMeetings((current) => applyChange(current, change, detail));
        }}
        policies={[timedOnly]}
        defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
        defaultTimeZone="Europe/Berlin"
        locale="en-US"
        weekRules={weekRules}
      >
        <Calendar.Frame>
          <Calendar.Viewport>
            <Calendar.ActiveView />
          </Calendar.Viewport>
        </Calendar.Frame>
      </Calendar.Root>
    </>
  );
}
// #endregion calendar
