// #region audit
import { createEventHistory } from "@moltenship/calendar-solid";
import { createSignal } from "solid-js";

import { weekdaysForAgents } from "./agent-policy";
import { applyChange, timedOnly, type MeetingChange } from "./agent-save";
import { UndoAgentChange } from "./agent-undo";
import { seed, weekRules } from "./app";
import { Calendar, type Meeting } from "./calendar";

function describe(change: MeetingChange): string {
  if (change.cause === "delete") return `deleted ${change.eventId}`;
  if (change.cause === "create") return "created a meeting";
  // "update" is an agent's `updateEvent`: a title, times, or both.
  const verb =
    change.cause === "move" ? "moved" : change.cause === "update" ? "updated" : "resized";
  return `${verb} ${change.eventId}`;
}

export function AuditedCalendar(props: { readonly onLog: (line: string) => void }) {
  const [meetings, setMeetings] = createSignal(seed);
  // The meeting each create became, by change ID, so the history can find it to undo.
  const createdIds = new Map<string, string>();
  const history = createEventHistory<Meeting, string, never>({
    // Only what an agent did: undo takes back its changes and leaves the person's alone.
    inputs: ["agent"],
    createdEventId: (change, events) => {
      const id = createdIds.get(change.id);
      return id !== undefined && events.get(id) !== undefined ? id : undefined;
    },
  });

  return (
    <Calendar.Root
      label="Team calendar"
      events={meetings()}
      // `detail.input` says who proposed the change: "pointer", "keyboard", "api" or "agent".
      onEventChange={(change, detail) => {
        const id =
          change.cause === "create" ? (change.event?.id ?? crypto.randomUUID()) : undefined;
        if (id !== undefined) createdIds.set(change.id, id);
        setMeetings((current) => applyChange(current, change, detail, id));
        props.onLog(`${detail.input} ${describe(change)}`);
      }}
      // How every proposal ended, a policy's refusal included, with the same detail.
      onEventChangeResult={(result, detail) => {
        history.record(result, detail);
        if (result.status === "rejected") {
          props.onLog(`${detail.input} was refused: ${result.reason}`);
        }
      }}
      // State changes say where they came from too: "agent", "mouse", "keyboard", "programmatic".
      onAnchorDateChange={(date, detail) =>
        props.onLog(`${detail.source} went to ${date.toString()}`)
      }
      onViewChange={(view, detail) => props.onLog(`${detail.source} switched to the ${view} view`)}
      policies={[timedOnly, weekdaysForAgents]}
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="Europe/Berlin"
      locale="en-US"
      weekRules={weekRules}
    >
      <Calendar.Frame>
        <Calendar.Toolbar>
          <Calendar.Title />
          <UndoAgentChange
            history={history}
            onRestore={({ id, title }) =>
              setMeetings((current) =>
                current.map((meeting) => (meeting.id === id ? { ...meeting, title } : meeting)),
              )
            }
          />
        </Calendar.Toolbar>
        <Calendar.Viewport>
          <Calendar.ActiveView />
        </Calendar.Viewport>
      </Calendar.Frame>
    </Calendar.Root>
  );
}
// #endregion audit
