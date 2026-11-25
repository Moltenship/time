import { Button } from "@registry/calendar-ui/button";
import { createEffect, createSignal, createUniqueId, For, Show } from "solid-js";

import type { DemoOccurrence } from "@demo/demo-model";

import { agent, webMcp } from "./agent";
import { Calendar } from "./calendar";
import { Checkbox } from "./ui/checkbox";
import { Label } from "./ui/label";

/** A step, with its arguments read from the events shown when it runs. */
interface Step {
  readonly action: string;
  readonly args?: (shown: readonly DemoOccurrence[]) => readonly unknown[] | undefined;
  readonly label: string;
}

interface Outcome {
  readonly id: number;
  readonly label: string;
  readonly message: string;
  readonly ok: boolean;
}

const local = (instant: Temporal.Instant, timeZone: string) =>
  instant.toZonedDateTimeISO(timeZone).toPlainDateTime().toString({ smallestUnit: "minute" });
/** A one-off timed event the visitor can change, the first the calendar shows. */
const firstEvent = (shown: readonly DemoOccurrence[]) =>
  shown.find(
    ({ event, interval, recurrence }) =>
      recurrence === undefined && event.live !== true && interval.kind === "timed",
  );

function steps(timeZone: () => string): readonly Step[] {
  const tomorrowAt = (time: string) =>
    local(
      Temporal.Now.plainDateISO(timeZone())
        .add({ days: 1 })
        .toZonedDateTime({ plainTime: Temporal.PlainTime.from(time), timeZone: timeZone() })
        .toInstant(),
      timeZone(),
    );
  const byId =
    (pick: (shown: readonly DemoOccurrence[]) => DemoOccurrence | undefined) =>
    (shown: readonly DemoOccurrence[]) => {
      const occurrence = pick(shown);
      return occurrence === undefined ? undefined : [{ eventId: occurrence.id }];
    };
  return [
    { action: "describeCalendar", label: "Read the calendar" },
    { action: "listEvents", label: "List the visible events" },
    { action: "navigateNext", label: "Next period" },
    { action: "navigateToday", label: "Back to today" },
    { action: "setView", args: () => [{ view: "week" }], label: "Switch to the week" },
    { action: "setView", args: () => [{ view: "agenda" }], label: "Switch to the agenda" },
    {
      action: "moveEvent",
      args: (shown) => {
        const occurrence = firstEvent(shown);
        return occurrence === undefined
          ? undefined
          : [{ eventId: occurrence.id, start: tomorrowAt("14:00") }];
      },
      label: "Move the first event to tomorrow 14:00",
    },
    {
      action: "createEvent",
      args: () => [
        { end: tomorrowAt("16:00"), start: tomorrowAt("15:00"), title: "Agent's event" },
      ],
      label: "Create an event tomorrow",
    },
    {
      action: "moveEvent",
      args: (shown) => {
        const live = shown.find(({ event }) => event.live === true);
        return live === undefined ? undefined : [{ eventId: live.id, start: tomorrowAt("09:00") }];
      },
      label: "Move a meeting in progress (refused)",
    },
    { action: "selectEvent", args: byId(firstEvent), label: "Select the first event" },
    { action: "deleteEvent", args: byId(firstEvent), label: "Delete the first event" },
  ];
}

function describeResult(result: unknown): string {
  if (result === undefined) return "done";
  if (typeof result === "object" && result !== null && "status" in result && "cause" in result) {
    return `${String(result.cause)}: ${String(result.status)}`;
  }
  return typeof result === "string" ? result : JSON.stringify(result);
}

/** The calendar's entry in the bridge's snapshot: what an agent reads before it acts. */
function readEntry() {
  return agent.snapshot().find((component) => component.component === "calendar");
}

/**
 * Shows what an agent sees and runs its commands through ui-sdk's bridge, by the calendar's name,
 * as a model would. Inside the root only to hear its changes: every command goes through
 * `agent.act`.
 */
export function AgentPanel(props: {
  readonly allowDelete: boolean;
  readonly events: readonly DemoOccurrence[];
  readonly onAllowDeleteChange: (next: boolean) => void;
  readonly timeZone: string;
}) {
  const headingId = createUniqueId();
  const snapshotId = createUniqueId();
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

  const record = (label: string, ok: boolean, message: string) =>
    setLog((current) => [{ id: (next += 1), label, message, ok }, ...current].slice(0, 6));

  async function run(step: Step) {
    const ref = readEntry()?.label;
    const args = step.args === undefined ? [] : step.args(props.events);
    if (ref === undefined || args === undefined) {
      record(step.label, false, "nothing to run it on");
      return;
    }
    const outcome = await agent.act({
      steps: [{ action: step.action, args: [...args], ref }],
    });
    const result = outcome.steps[0]?.result;
    record(
      step.label,
      outcome.ok,
      outcome.ok ? describeResult(result) : (outcome.error?.message ?? "failed"),
    );
    setTimeout(() => setEntry(readEntry()), 0);
  }

  return (
    <section aria-labelledby={headingId} class="grid min-w-0 gap-3 px-2" data-slot="agent-panel">
      <h2 id={headingId} class="text-sm font-medium">
        Agent
      </h2>
      <p class="text-xs text-muted-foreground">
        Each button runs one step through ui-sdk's <code>agent.act</code>, by the calendar's name.
        WebMCP: <span data-webmcp={webMcp}>{webMcp}</span>.
      </p>
      <Label class="font-normal">
        <Checkbox checked={props.allowDelete} onCheckedChange={props.onAllowDeleteChange} />
        Let the agent delete events
      </Label>
      <div class="grid gap-1.5">
        <For each={steps(() => props.timeZone)}>
          {(step) => (
            <Button
              class="h-auto min-h-7 justify-start py-1 text-left whitespace-normal"
              data-agent-step={step.action}
              onClick={() => void run(step)}
              size="sm"
              variant="outline"
            >
              {step.label}
            </Button>
          )}
        </For>
      </div>
      <ol aria-label="Agent results" aria-live="polite" class="grid gap-1 text-xs">
        <For each={log()} fallback={<li class="text-muted-foreground">Nothing run yet.</li>}>
          {(outcome) => (
            <li
              class={outcome.ok ? undefined : "text-destructive"}
              data-failed={outcome.ok ? undefined : ""}
              data-ok={outcome.ok ? "" : undefined}
            >
              <span class="font-medium">{outcome.label}</span>: {outcome.message}
            </li>
          )}
        </For>
      </ol>
      <details class="text-xs">
        <summary class="cursor-pointer text-muted-foreground">What the agent sees</summary>
        <Show when={entry()} fallback={<p class="mt-2">The calendar isn't on the page.</p>}>
          {/* It scrolls, so it takes focus, for the keyboard to scroll it. */}
          {(seen) => (
            <pre
              aria-label="What the agent sees"
              class="mt-2 max-h-64 overflow-auto rounded-md border bg-muted p-2 font-mono text-[0.6875rem] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              data-agent-snapshot=""
              id={snapshotId}
              role="region"
              tabindex="0"
            >
              {JSON.stringify(seen(), null, 2)}
            </pre>
          )}
        </Show>
      </details>
    </section>
  );
}
