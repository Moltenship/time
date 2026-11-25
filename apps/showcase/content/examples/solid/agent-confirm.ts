// #region confirm
import { createAgent } from "@ui-sdk/solid/agent";
import { createSignal } from "solid-js";

/** A delete the agent asked for, waiting for the person's answer. */
export interface DeleteRequest {
  readonly answer: (allowed: boolean) => void;
  readonly eventId: string;
}

const [request, setRequest] = createSignal<DeleteRequest | null>(null);

/** The request on screen, as an accessor. */
export const deleteRequest = request;

/** The event a step names. `allow` runs before the calendar checks the step's arguments. */
function eventIdOf(args: readonly unknown[]): string {
  const input = args[0];
  if (typeof input !== "object" || input === null || !("eventId" in input)) return "";
  return typeof input.eventId === "string" || typeof input.eventId === "number"
    ? String(input.eventId)
    : "";
}

export const agent = createAgent({
  allow: ({ action, args, component }, { signal }) => {
    if (component !== "calendar") return false;
    if (action !== "deleteEvent") return true;
    // The bridge holds this step, and every call after it, until the promise settles.
    return new Promise<boolean>((resolve) => {
      const answer = (allowed: boolean) => {
        setRequest(null);
        resolve(allowed);
      };
      // Nobody answered in time, or the turn was stopped: take the question down.
      signal.addEventListener("abort", () => answer(false), { once: true });
      setRequest({ answer, eventId: eventIdOf(args) });
    });
  },
  // How long a step waits for the answer. Five minutes when left out.
  timeout: 60_000,
});
// #endregion confirm
