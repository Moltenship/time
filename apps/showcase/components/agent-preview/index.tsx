import type { ReactNode } from "react";

import {
  AgentChangesIsland,
  AgentDeleteIsland,
  AgentOverviewIsland,
  AgentPermissionsIsland,
  AgentSaveIsland,
  AgentServerIsland,
  AgentWebMcpIsland,
} from "./island";

/**
 * The frame of an agent guide's example. Each one is a real calendar beside what a real bridge
 * lists for it, with buttons that send the calls a model would; no model runs on these pages.
 * The frame is sized on the server, so the example loading into it never shifts the page.
 */
function AgentFigure({
  caption,
  children,
}: {
  readonly caption: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <figure className="not-prose my-6">
      <div className="min-h-[48rem] overflow-hidden rounded-xl border bg-fd-background text-left shadow-sm">
        {children}
      </div>
      <figcaption className="mt-3 text-center text-sm text-fd-muted-foreground">
        {caption}
      </figcaption>
    </figure>
  );
}

/** A calendar beside what an agent's bridge lists for it, with buttons that run scripted steps. */
export function AgentPreview() {
  return (
    <AgentFigure caption="Live. The buttons call the bridge as a model's tool calls would, and each result is what the model gets back; no model runs on this page. Drag a meeting and the snapshot follows.">
      <AgentOverviewIsland />
    </AgentFigure>
  );
}

/** The same calendar behind a bridge whose `allow` reads a switch. */
export function AgentPermissionsPreview() {
  return (
    <AgentFigure caption="Live. Change what the agent may do, then run a step: the bridge asks allow before each one. This bridge lets an agent read at every level.">
      <AgentPermissionsIsland />
    </AgentFigure>
  );
}

/** A calendar that logs who made each change, refuses an agent's weekend booking, and undoes it. */
export function AgentChangesPreview() {
  return (
    <AgentFigure caption="Live. Drag a meeting onto Saturday yourself, then let the agent try: the policy refuses the agent only, and the step says why. Undo the agent takes back its changes and leaves yours.">
      <AgentChangesIsland />
    </AgentFigure>
  );
}

/** A calendar whose saves take two seconds, and the change an agent gets back meanwhile. */
export function AgentSavePreview() {
  return (
    <AgentFigure caption="Live. Each save takes two seconds. Run a change and read its status, ask again once it has landed, then make the server fail and do the same.">
      <AgentSaveIsland />
    </AgentFigure>
  );
}

/** A calendar whose bridge asks the person before an agent's delete runs. */
export function AgentDeletePreview() {
  return (
    <AgentFigure caption="Live. Ask for a delete, then answer above the calendar. The step waits for you, and fails if you keep the meeting.">
      <AgentDeleteIsland />
    </AgentFigure>
  );
}

/** Whether this browser has WebMCP, what `registerTools` hands it, and the tools called. */
export function AgentWebMcpPreview() {
  return (
    <AgentFigure caption="Live. Register the tools, then call them as a browser's agent would. In a browser without WebMCP a stand-in takes the tools; the bridge behind them is the real one.">
      <AgentWebMcpIsland />
    </AgentFigure>
  );
}

/** The bridge's tool definitions, and recorded tool calls run through the guide's own handler. */
export function AgentServerPreview() {
  return (
    <AgentFigure caption="Live, without a model: the calls are recorded, and nothing is sent anywhere. The handler and the bridge are the ones this guide shows.">
      <AgentServerIsland />
    </AgentFigure>
  );
}
