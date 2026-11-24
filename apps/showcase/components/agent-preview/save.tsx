"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { agent } from "@/content/examples/agent";
import { SavedCalendar } from "@/content/examples/agent-slow-save";

import { AgentCode, AgentPanel, AgentPlayground, type AgentScript } from "./playground";
import { actCall, createMeeting, describeCalendar, moveReview, scriptOn } from "./scripts";

/** This example's calendar, which shares the changes guide's page with another one. */
const bookings = "Bookings";

/** How long this example's stand-in for a server takes to answer. */
const saveTime = 2000;

type Server = "saves" | "fails";

const servers: readonly { readonly label: string; readonly value: Server }[] = [
  { label: "Saves after two seconds", value: "saves" },
  { label: "Fails after two seconds", value: "fails" },
];

const askHowItEnded: AgentScript = {
  // Written from the change the last step returned, as a model reads it from its context.
  calls: [({ changeId }) => actCall(["getChange", { changeId: changeId ?? "" }])],
  label: "Ask how the last change ended",
  needsChange: true,
};

const scripts: readonly AgentScript[] = [
  moveReview,
  createMeeting,
  askHowItEnded,
  describeCalendar,
].map((script) => scriptOn(bookings, script));

/**
 * The changes guide's second example: a save that takes two seconds. The step returns the change
 * as `saving`, and `getChange` says how it ended, saved or rejected.
 */
export default function AgentSaveExample() {
  const [run, setRun] = useState(0);
  const [server, setServer] = useState<Server>("saves");
  const [heard, setHeard] = useState<readonly string[]>([]);
  const name = useId();
  // Read when a save ends, so a switch made while one waits still decides it.
  const answer = useRef(server);
  useEffect(() => {
    answer.current = server;
  }, [server]);

  const save = useCallback(
    () =>
      new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          if (answer.current === "saves") resolve();
          else reject(new Error("The server didn't save the change."));
        }, saveTime);
      }),
    [],
  );

  return (
    <AgentPlayground
      agent={agent}
      calendar={
        <SavedCalendar
          key={run}
          onAgentSaveFailed={(change) =>
            setHeard((current) => [
              `The agent's ${change.cause} failed to save, and the calendar put it back.`,
              ...current,
            ])
          }
          save={save}
        />
      }
      hint="Run a change, then ask how it ended: within two seconds it is still saving."
      label={bookings}
      onReset={() => {
        setHeard([]);
        setRun((current) => current + 1);
      }}
      scripts={scripts}
    >
      <AgentPanel className="border-b" title="The server this example saves to">
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm" role="radiogroup">
          {servers.map((option) => (
            <label key={option.value} className="flex items-center gap-2">
              <input
                checked={server === option.value}
                className="accent-fd-primary"
                name={name}
                onChange={() => setServer(option.value)}
                type="radio"
                value={option.value}
              />
              {option.label}
            </label>
          ))}
        </div>
        <AgentCode label="What onEventChangeResult heard of the agent's failed saves">
          {heard.length === 0
            ? "Your onEventChangeResult has heard of no failed save."
            : heard.join("\n")}
        </AgentCode>
      </AgentPanel>
    </AgentPlayground>
  );
}
