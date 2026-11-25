// The agent guides' live examples: a calendar, buttons that send the calls a model would send,
// and the bridge's answer to the last one. No model runs.

// #region steps
import type { JSX } from "@solidjs/web";
import type { AgentStep, createAgent } from "@ui-sdk/solid/agent";
import { createSignal, For } from "solid-js";

/** One `act` call, behind a button. */
export interface AgentCall {
  readonly label: string;
  readonly steps: readonly AgentStep[];
}

/** A step on the calendar the examples label "Team calendar", with the one object it takes. */
export function step(action: string, input?: Readonly<Record<string, unknown>>): AgentStep {
  return { action, args: input === undefined ? [] : [input], ref: "Team calendar" };
}

export function AgentSteps(props: {
  readonly agent: ReturnType<typeof createAgent>;
  readonly calls: readonly AgentCall[];
  readonly children: JSX.Element;
}) {
  const [answer, setAnswer] = createSignal("Nothing sent yet.");
  const send = async (call: AgentCall) => {
    setAnswer("Waiting for the answer.");
    // What a model's tool call runs: the steps in order, and what they changed together.
    const result = await props.agent.act({ steps: [...call.steps] });
    setAnswer(JSON.stringify(result, null, 2));
  };

  return (
    <>
      {props.children}
      <h2>The agent sends</h2>
      <For each={props.calls}>
        {(call) => (
          <button type="button" onClick={() => void send(call)}>
            {call.label}
          </button>
        )}
      </For>
      <h2>The bridge answers</h2>
      <pre style={{ "white-space": "pre-wrap" }}>{answer()}</pre>
    </>
  );
}
// #endregion steps
