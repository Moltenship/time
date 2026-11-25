// #region stop
import { agent } from "./agent-confirm";

let turn = new AbortController();

/** A delete the person can stop while its question is open. */
export function deleteEvent(eventId: string) {
  return agent.act(
    { steps: [{ ref: "Team calendar", action: "deleteEvent", args: [{ eventId }] }] },
    { signal: turn.signal },
  );
}

/** For your Stop button: ends the step that waits, and takes its question down. */
export function stop(): void {
  turn.abort();
  turn = new AbortController();
}
// #endregion stop
