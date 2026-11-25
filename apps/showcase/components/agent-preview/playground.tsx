"use client";

import type { AgentComponent, createAgent } from "@ui-sdk/react/agent";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

export type AgentBridge = ReturnType<typeof createAgent>;

/** One call to the bridge, as a model's tool call would make it. */
export type AgentCall =
  | { readonly tool: "act"; readonly input: Parameters<AgentBridge["act"]>[0] }
  | { readonly tool: "query"; readonly input: Parameters<AgentBridge["query"]>[0] }
  | { readonly tool: "snapshot"; readonly input?: undefined };

/** What the example remembers of the calls so far, as a model keeps it in its context. */
export interface AgentMemory {
  /** The `changeId` of the last change a step returned. */
  readonly changeId: string | undefined;
}

/** A button that runs scripted calls through the bridge, in order. */
export interface AgentScript {
  /** A call, or one written from what earlier calls returned. */
  readonly calls: readonly (AgentCall | ((memory: AgentMemory) => AgentCall))[];
  readonly label: string;
  /** Whether the button waits until a step has returned a change. */
  readonly needsChange?: boolean;
}

interface CallRecord {
  readonly call: AgentCall;
  readonly output: unknown;
}

const json = (value: unknown) => JSON.stringify(value, null, 2) ?? "undefined";

/** The ID of the last change in what `act` returned, when one of its steps proposed a change. */
function changeIdIn(output: unknown): string | undefined {
  if (typeof output !== "object" || output === null || !("steps" in output)) return undefined;
  const { steps } = output;
  if (!Array.isArray(steps)) return undefined;
  let found: string | undefined;
  for (const step of steps as readonly { readonly result?: unknown }[]) {
    const { result } = step;
    if (typeof result !== "object" || result === null || !("changeId" in result)) continue;
    if (typeof result.changeId === "string") found = result.changeId;
  }
  return found;
}

/** Runs a call on the bridge, as the page's own tool handler would. */
export async function callBridge(agent: AgentBridge, call: AgentCall): Promise<unknown> {
  if (call.tool === "act") return agent.act(call.input);
  if (call.tool === "query") return agent.query(call.input);
  // Calendars of pages visited before stay in the bridge's memory as `offPage`.
  return agent.snapshot().filter((component) => component.offPage !== true);
}

/** The calendar named `label`, as the bridge's snapshot lists it now. */
export function calendarEntry(agent: AgentBridge, label: string): AgentComponent | undefined {
  return agent
    .snapshot()
    .find(
      (entry) => entry.component === "calendar" && entry.offPage !== true && entry.label === label,
    );
}

/** The bridge's entry for a calendar, read again whenever the calendar inside `scope` changes. */
function useCalendarEntry(agent: AgentBridge, label: string, scope: HTMLElement | null) {
  const [entry, setEntry] = useState<string | null>(null);
  const read = useCallback(() => {
    const found = calendarEntry(agent, label);
    setEntry(found === undefined ? null : json(found));
  }, [agent, label]);

  useEffect(() => {
    if (scope === null) return undefined;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(read);
    };
    schedule();
    // Events aren't state of the calendar's primitive, so the page says when they change.
    const observer = new MutationObserver(schedule);
    observer.observe(scope, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
    const unsubscribe = agent.subscribe(schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      unsubscribe();
    };
  }, [agent, read, scope]);

  return entry;
}

function Panel({
  children,
  className = "",
  title,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly title: ReactNode;
}) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className={`flex min-w-0 flex-col gap-2 p-4 ${className}`}>
      <h3 className="text-sm font-medium" id={titleId}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Code({
  children,
  className = "max-h-64",
  label,
}: {
  readonly children: string;
  readonly className?: string;
  readonly label: string;
}) {
  return (
    <pre
      aria-label={label}
      className={`overflow-auto rounded-lg bg-fd-muted p-3 font-mono text-xs leading-5 break-words whitespace-pre-wrap text-fd-foreground ${className}`}
      // Scrollable, so reachable by keyboard.
      tabIndex={0}
    >
      {children}
    </pre>
  );
}

export const scriptButtonClass =
  "rounded-full border bg-fd-background px-3 py-1.5 text-sm font-medium text-fd-foreground transition-colors outline-none hover:bg-fd-accent focus-visible:ring-2 focus-visible:ring-fd-ring disabled:opacity-50";

export interface AgentPlaygroundProps {
  readonly agent: AgentBridge;
  /** The calendar, which fills the frame above the panels. */
  readonly calendar: ReactNode;
  /** More panels, such as a permission switch or a log, shown before the agent's steps. */
  readonly children?: ReactNode;
  /** How the log writes a call; `agent.act({…})` by default. */
  readonly formatCall?: (call: AgentCall, index: number) => string;
  /** What the steps' panel says before any step ran. */
  readonly hint?: ReactNode;
  /** The calendar's `label`, which the scripted steps name it by. */
  readonly label: string;
  /** Puts the example back as it loaded. */
  readonly onReset?: () => void;
  /** Runs a call and returns what to show for it; the bridge's own method by default. */
  readonly runCall?: (call: AgentCall, index: number) => Promise<unknown>;
  readonly scripts: readonly AgentScript[];
  /** The heading over the scripted steps. */
  readonly scriptsTitle?: string;
}

/**
 * The frame the agent guides' examples share: a calendar, buttons that run scripted steps through
 * the example's own bridge, the call and what it returned, and the calendar as the bridge's
 * snapshot lists it. No model runs here: the buttons stand in for one, and the bridge is real.
 */
export function AgentPlayground({
  agent,
  calendar,
  children,
  formatCall = (call) => `agent.${call.tool}(${call.input === undefined ? "" : json(call.input)})`,
  hint = "Each button calls the bridge the way a model's tool call does. The call and its result show here.",
  label,
  onReset,
  runCall,
  scripts,
  scriptsTitle = "Run a step as the agent",
}: AgentPlaygroundProps) {
  const [scope, setScope] = useState<HTMLDivElement | null>(null);
  const entry = useCalendarEntry(agent, label, scope);
  const [records, setRecords] = useState<readonly CallRecord[]>([]);
  const [running, setRunning] = useState(false);
  const [changeId, setChangeId] = useState<string | undefined>(undefined);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function run(script: AgentScript) {
    setRunning(true);
    const next: CallRecord[] = [];
    let lastChangeId = changeId;
    try {
      for (const [index, scripted] of script.calls.entries()) {
        const call =
          typeof scripted === "function" ? scripted({ changeId: lastChangeId }) : scripted;
        const output =
          runCall === undefined ? await callBridge(agent, call) : await runCall(call, index);
        lastChangeId = changeIdIn(output) ?? lastChangeId;
        next.push({ call, output });
        if (!mounted.current) return;
        setRecords([...next]);
        setChangeId(lastChangeId);
      }
    } finally {
      if (mounted.current) setRunning(false);
    }
  }

  return (
    <div className="flex flex-col">
      <div className="h-[34rem] border-b" ref={setScope}>
        {calendar}
      </div>
      {children}
      <div className="grid divide-y lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        <Panel title={scriptsTitle}>
          <div className="flex flex-wrap gap-2">
            {scripts.map((script) => (
              <button
                key={script.label}
                className={scriptButtonClass}
                disabled={running || (script.needsChange === true && changeId === undefined)}
                onClick={() => void run(script)}
                type="button"
              >
                {script.label}
              </button>
            ))}
            {onReset === undefined ? null : (
              <button
                className={`${scriptButtonClass} border-transparent text-fd-muted-foreground`}
                onClick={() => {
                  setRecords([]);
                  setChangeId(undefined);
                  onReset();
                }}
                type="button"
              >
                Reset
              </button>
            )}
          </div>
          <div aria-live="polite" className="flex flex-col gap-2">
            {records.length === 0 ? (
              <p className="text-sm text-fd-muted-foreground">{hint}</p>
            ) : (
              records.map(({ call, output }, index) => (
                <div key={index} className="flex flex-col gap-2" data-agent-call={call.tool}>
                  <Code label={`Call ${index + 1}`}>{formatCall(call, index)}</Code>
                  <Code label={`Result ${index + 1}`}>{json(output)}</Code>
                </div>
              ))
            )}
          </div>
        </Panel>
        <Panel title="What the agent sees">
          <Code className="max-h-[32rem]" label="The calendar in the bridge's snapshot">
            {entry ?? "The calendar isn't in the snapshot."}
          </Code>
        </Panel>
      </div>
    </div>
  );
}

export { Code as AgentCode, json as agentJson, Panel as AgentPanel };
