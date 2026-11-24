"use client";

import { useEffect, useRef, useState } from "react";

import { agent } from "@/content/examples/agent";
import { AgentReadyCalendar } from "@/content/examples/agent-calendar";
import { hasWebMcp, registerCalendarTools } from "@/content/examples/agent-webmcp";

import {
  agentJson,
  AgentPanel,
  AgentPlayground,
  scriptButtonClass,
  type AgentCall,
  type AgentScript,
} from "./playground";
import {
  act,
  calendarLabel,
  describeCalendar,
  listEvents,
  moveReview,
  nextWeek,
  readPage,
} from "./scripts";

/** A tool as `registerTools` hands it to `document.modelContext.registerTool`. */
interface RegisteredTool {
  readonly annotations?: Readonly<Record<string, boolean>>;
  readonly description: string;
  readonly execute: (input: unknown, context?: { readonly signal?: AbortSignal }) => unknown;
  readonly name: string;
}

interface ModelContext {
  registerTool(
    tool: RegisteredTool,
    options?: { readonly signal?: AbortSignal },
  ): Promise<unknown> | undefined;
}

interface Registration {
  /** Whether the browser itself took the tools, or only this panel's stand-in did. */
  readonly browser: boolean;
  readonly tools: readonly RegisteredTool[];
  readonly unregister: () => void;
}

/**
 * Runs `register` and notes each tool it hands to `document.modelContext`. In a browser with
 * WebMCP the tools still reach the browser. In one without, a stand-in takes them, so the panel
 * can show what a browser would have been given; nothing else on the page is replaced.
 */
function recordRegistration(register: () => () => void): Registration {
  const host = document as Document & { modelContext?: ModelContext };
  const browser = host.modelContext;
  const tools: RegisteredTool[] = [];
  const recording: ModelContext = {
    registerTool(tool, options) {
      tools.push(tool);
      return browser?.registerTool(tool, options) ?? Promise.resolve();
    },
  };
  Object.defineProperty(host, "modelContext", { configurable: true, value: recording });
  try {
    return { browser: browser !== undefined, tools, unregister: register() };
  } finally {
    // Back to the browser's own, which lives on the prototype, or to none.
    delete host.modelContext;
  }
}

const scripts: readonly AgentScript[] = [
  readPage,
  describeCalendar,
  listEvents,
  nextWeek,
  moveReview,
  // This registration's `allow` refuses it.
  act("Change the time zone", ["setTimeZone", { timeZone: "America/New_York" }]),
];

/**
 * The WebMCP guide's example: whether this browser takes tools from a page, what
 * `registerTools` hands it, and the registered tools called the way a browser's agent calls them.
 */
export default function AgentWebMcpExample() {
  const [run, setRun] = useState(0);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [registration, setRegistration] = useState<Registration | null>(null);
  const current = useRef<Registration | null>(null);

  useEffect(() => {
    setSupported(hasWebMcp());
    // Leaving the page takes the tools back.
    return () => current.current?.unregister();
  }, []);

  function toggle() {
    if (current.current === null) {
      current.current = recordRegistration(registerCalendarTools);
    } else {
      current.current.unregister();
      current.current = null;
    }
    setRegistration(current.current);
  }

  async function runCall(call: AgentCall): Promise<unknown> {
    const tool = registration?.tools.find(({ name }) => name === call.tool);
    if (tool === undefined) return { error: `No tool named ${call.tool} is registered.` };
    return tool.execute(call.input ?? {});
  }

  return (
    <AgentPlayground
      agent={agent}
      calendar={<AgentReadyCalendar key={run} />}
      formatCall={(call) => `${call.tool}.execute(${agentJson(call.input ?? {})})`}
      hint={
        registration === null
          ? "Register the tools first. Each button then calls a registered tool's execute, as the browser's agent does."
          : "Each button calls a registered tool's execute, as the browser's agent does."
      }
      label={calendarLabel}
      onReset={() => setRun((value) => value + 1)}
      runCall={runCall}
      scripts={registration === null ? [] : scripts}
      scriptsTitle="Call a registered tool"
    >
      <AgentPanel className="border-b" title="WebMCP in this browser">
        <p className="text-sm" data-webmcp={supported === null ? "unknown" : String(supported)}>
          {supported === null
            ? "Checking…"
            : supported
              ? "Available: document.modelContext.registerTool is a function, so the browser's agent gets the tools."
              : "Not available: this browser has no document.modelContext, so registerTools does nothing here. A stand-in for the browser takes the tools instead, to show what a browser with WebMCP is given."}
        </p>
        <div>
          <button className={scriptButtonClass} onClick={toggle} type="button">
            {registration === null
              ? supported === false
                ? "Register the tools with the stand-in"
                : "Register the tools"
              : "Unregister the tools"}
          </button>
        </div>
        {registration === null ? (
          <p className="text-sm text-fd-muted-foreground">No tools are registered.</p>
        ) : (
          <ul aria-label="Registered tools" className="flex flex-col gap-2 text-sm">
            {registration.tools.map((tool) => (
              <li key={tool.name} className="rounded-lg bg-fd-muted p-3">
                <p className="font-mono text-xs font-medium">
                  {tool.name}
                  <span className="font-normal text-fd-muted-foreground">
                    {" · "}
                    {Object.entries(tool.annotations ?? {})
                      .filter(([, value]) => value)
                      .map(([name]) => name)
                      .join(", ")}
                  </span>
                </p>
                <p className="mt-1 line-clamp-2 text-xs text-fd-muted-foreground">
                  {tool.description}
                </p>
              </li>
            ))}
          </ul>
        )}
      </AgentPanel>
    </AgentPlayground>
  );
}
