"use client";

import type Anthropic from "@anthropic-ai/sdk";
import { useRef, useState, type FormEvent } from "react";

import { runTurn } from "./agent-turn";

/** The text of a message; a message that only carries tool calls or results has none. */
function textOf({ content }: Anthropic.MessageParam): string {
  if (typeof content === "string") return content;
  return content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
}

export function AgentChat() {
  const [messages, setMessages] = useState<Anthropic.MessageParam[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const turn = useRef<AbortController | null>(null);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const message = new FormData(form).get("message");
    const text = typeof message === "string" ? message.trim() : "";
    if (text === "" || busy) return;
    form.reset();

    const controller = new AbortController();
    turn.current = controller;
    const next: Anthropic.MessageParam[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setBusy(true);
    setFailure(null);
    try {
      setMessages(await runTurn(next, controller.signal));
    } catch (error) {
      // A stopped turn keeps what the calendar already changed; only the conversation ends.
      if (!controller.signal.aborted) setFailure(String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Calendar assistant">
      <ol>
        {messages.map((message, index) => {
          const text = textOf(message);
          // Keyed by position: the list only grows.
          return text === "" ? null : <li key={index}>{`${message.role}: ${text}`}</li>;
        })}
      </ol>
      {failure === null ? null : <p role="alert">{failure}</p>}
      <form onSubmit={send}>
        <input aria-label="Message" name="message" />
        <button disabled={busy} type="submit">
          Send
        </button>
        <button disabled={!busy} onClick={() => turn.current?.abort()} type="button">
          Stop
        </button>
      </form>
    </section>
  );
}
