"use client";

import type Anthropic from "@anthropic-ai/sdk";
import { agentTools } from "@ui-sdk/react/agent";
import { useState } from "react";

import { agent } from "@/content/examples/agent";
import { AgentReadyCalendar } from "@/content/examples/agent-calendar";
import { runToolCall } from "@/content/examples/agent-tool-call";

import {
  agentJson,
  AgentCode,
  AgentPanel,
  AgentPlayground,
  type AgentCall,
  type AgentScript,
} from "./playground";
import { act, calendarLabel, createMeeting, moveReview, readPage } from "./scripts";

// What a model does first: find the calendar, then ask it for its facts and its events.
const readCalendar = act("Read the calendar", ["describeCalendar"], ["listEvents"]);

const scripts: readonly AgentScript[] = [
  {
    calls: [...readPage.calls, ...readCalendar.calls, ...moveReview.calls],
    label: "Replay: “Move the design review to Friday at 10”",
  },
  {
    calls: [...readPage.calls, ...readCalendar.calls, ...createMeeting.calls],
    label: "Replay: “Book a customer call on Tuesday at 2”",
  },
];

/** A scripted call in the shape the Messages API sends a tool call in. */
function toolUse(call: AgentCall, index: number) {
  return {
    id: `toolu_recorded_${index + 1}`,
    input: call.input ?? {},
    name: call.tool,
    type: "tool_use",
  } as Anthropic.ToolUseBlock;
}

/**
 * The server guide's example: the tool definitions a model is given, and recorded tool calls run
 * through the guide's own `runToolCall`. No request leaves the page.
 */
export default function AgentServerExample() {
  const [run, setRun] = useState(0);
  return (
    <AgentPlayground
      agent={agent}
      calendar={<AgentReadyCalendar key={run} />}
      formatCall={(call, index) => agentJson(toolUse(call, index))}
      hint="Each button replays tool calls written by hand in the shape a model sends them, through the guide's runToolCall and the real bridge. The results are what would go back to the model."
      label={calendarLabel}
      onReset={() => setRun((value) => value + 1)}
      runCall={(call, index) => runToolCall(toolUse(call, index))}
      scripts={scripts}
      scriptsTitle="Replay a recorded turn"
    >
      <AgentPanel className="border-b" title="The tools the model is given">
        <AgentCode label="The bridge's tool definitions">
          {agentJson(
            agentTools.map(({ description, inputSchema, name }) => ({
              name,
              description,
              input_schema: inputSchema,
            })),
          )}
        </AgentCode>
      </AgentPanel>
    </AgentPlayground>
  );
}
