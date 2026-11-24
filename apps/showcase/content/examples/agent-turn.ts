"use client";

import type Anthropic from "@anthropic-ai/sdk";

import { runToolCall } from "./agent-tool-call";

/** One turn: asks the model, runs the calls it makes on the page, until it stops calling. */
export async function runTurn(
  history: readonly Anthropic.MessageParam[],
  signal?: AbortSignal,
): Promise<Anthropic.MessageParam[]> {
  const messages = [...history];

  for (;;) {
    const response = await fetch("/api/agent", {
      body: JSON.stringify({ messages }),
      headers: { "content-type": "application/json" },
      method: "POST",
      signal,
    });
    if (!response.ok) throw new Error(`The agent route answered ${response.status}.`);
    const message = (await response.json()) as Anthropic.Message;

    // The content as it came, thinking blocks included: the next request needs them unchanged.
    messages.push({ role: "assistant", content: message.content });
    // "end_turn" is the answer. "max_tokens" and "refusal" end the turn too, without one.
    if (message.stop_reason !== "tool_use") return messages;

    // In order, one at a time: a step can depend on the one before it.
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of message.content) {
      if (block.type === "tool_use") results.push(await runToolCall(block, signal));
    }
    // Every result of the message in one user message.
    messages.push({ role: "user", content: results });
  }
}
