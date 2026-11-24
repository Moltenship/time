"use client";

import type Anthropic from "@anthropic-ai/sdk";

import { agent } from "./agent";

type BridgeTool = "act" | "query" | "snapshot";

const isBridgeTool = (name: string): name is BridgeTool =>
  name === "act" || name === "query" || name === "snapshot";

/** Runs one of the model's tool calls on the page and wraps what the bridge returned. */
export async function runToolCall(
  call: Anthropic.ToolUseBlock,
  signal?: AbortSignal,
): Promise<Anthropic.ToolResultBlockParam> {
  if (!isBridgeTool(call.name)) {
    return {
      type: "tool_result",
      tool_use_id: call.id,
      content: `No tool is named ${call.name}.`,
      is_error: true,
    };
  }
  const output =
    call.name === "act"
      ? // The signal ends a step that waits for a person when the turn is stopped.
        await agent.act(call.input as never, { signal })
      : await agent[call.name](call.input as never);
  // A step that failed comes back as `ok: false` with the reason, for the model to read.
  return { type: "tool_result", tool_use_id: call.id, content: JSON.stringify(output) };
}
