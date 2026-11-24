import { createEffect, createSignal, For, Show } from "solid-js";

import { agent, webMcp } from "./agent";
import { Calendar } from "./calendar";

interface Step {
  readonly action: string;
  readonly args: readonly unknown[];
  readonly label: string;
}

interface Outcome {
  readonly id: number;
  readonly label: string;
  readonly message: string;
  readonly ok: boolean;
}

const NAME = "Team calendar";

/** A step's result: an event change is `pending` until the application's new events confirm it. */
function describeResult(result: unknown): string {
  if (result === undefined) return "done";
  // An event change says where it is: saved at once, or still being decided or saved.
  if (typeof result === "object" && result !== null && "status" in result && "cause" in result) {
    return `${String(result.cause)}: ${String(result.status)}`;
  }
  return typeof result === "string" ? result : JSON.stringify(result);
}

/** The calendar's entry in the bridge's snapshot: what an agent reads before it acts. */
function readEntry() {
  return agent
    .snapshot()
    .find((component) => component.component === "calendar" && component.label === NAME);
}

/**
 * Shows what the agent sees and runs its commands through the bridge, by the calendar's name, as a
 * model would. Inside the root only to hear its changes: every command goes through `agent.act`.
 */
export function AgentPanel(props: {
  readonly allowDelete: boolean;
  readonly onAllowDeleteChange: (next: boolean) => void;
  readonly steps: readonly Step[];
}) {
  const state = Calendar.useCalendarState();
  const meta = Calendar.useCalendarMeta();
  const [entry, setEntry] = createSignal(readEntry());
  const [log, setLog] = createSignal<readonly Outcome[]>([]);
  let next = 0;

  // The bridge reads the primitive's instance, which the root updates as it commits: read it a
  // task after the calendar changes, from outside Solid's flush.
  createEffect(
    () => [state(), meta()] as const,
    () => {
      const timer = setTimeout(() => setEntry(readEntry()), 0);
      return () => clearTimeout(timer);
    },
  );

  async function run(step: Step) {
    const outcome = await agent.act({
      steps: [{ action: step.action, args: [...step.args], ref: NAME }],
    });
    const result = outcome.steps[0]?.result;
    setLog((current) => [
      {
        id: (next += 1),
        label: step.label,
        message: outcome.ok ? describeResult(result) : (outcome.error?.message ?? "failed"),
        ok: outcome.ok,
      },
      ...current,
    ]);
    setTimeout(() => setEntry(readEntry()), 0);
  }

  return (
    <aside class="agent" aria-labelledby="agent-heading">
      <h2 id="agent-heading">Agent</h2>
      <p class="hint">
        Each button runs one step through <code>agent.act</code>, by the calendar's name. WebMCP:{" "}
        <strong data-webmcp={webMcp}>{webMcp}</strong>.
      </p>
      <label class="toggle">
        <input
          type="checkbox"
          checked={props.allowDelete}
          onChange={(event) => props.onAllowDeleteChange(event.currentTarget.checked)}
        />
        <span>
          Let the agent delete events (<code>allowAgentDelete</code>)
        </span>
      </label>
      <div class="agent-actions">
        <For each={props.steps}>
          {(step) => (
            <button type="button" data-agent-step={step.action} onClick={() => void run(step)}>
              {step.label}
            </button>
          )}
        </For>
      </div>
      <h3>Results</h3>
      <ol class="agent-log" aria-live="polite">
        <For each={log()} fallback={<li class="empty">Nothing run yet.</li>}>
          {(outcome) => (
            <li data-ok={outcome.ok ? "" : undefined} data-failed={outcome.ok ? undefined : ""}>
              <strong>{outcome.label}</strong>: {outcome.message}
            </li>
          )}
        </For>
      </ol>
      <h3>What the agent sees</h3>
      <Show when={entry()} fallback={<p class="empty">The calendar isn't on the page.</p>}>
        {(seen) => <pre data-agent-snapshot="">{JSON.stringify(seen(), null, 2)}</pre>}
      </Show>
    </aside>
  );
}
