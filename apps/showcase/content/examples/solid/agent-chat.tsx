// #region chat
import type Anthropic from "@anthropic-ai/sdk";
import { createSignal, For, Show } from "solid-js";

import { runTurn } from "./agent-turn";

/** The text of a message; a message that only carries tool calls or results has none. */
function textOf({ content }: Anthropic.MessageParam): string {
  if (typeof content === "string") return content;
  return content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
}

export function AgentChat() {
  const [messages, setMessages] = createSignal<Anthropic.MessageParam[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [failure, setFailure] = createSignal<string | null>(null);
  // A component runs once, so a plain variable keeps the turn in progress.
  let turn: AbortController | null = null;

  async function send(event: SubmitEvent & { currentTarget: HTMLFormElement }) {
    event.preventDefault();
    const form = event.currentTarget;
    const message = new FormData(form).get("message");
    const text = typeof message === "string" ? message.trim() : "";
    if (text === "" || busy()) return;
    form.reset();

    const controller = new AbortController();
    turn = controller;
    const next: Anthropic.MessageParam[] = [...messages(), { role: "user", content: text }];
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
        <For each={messages()}>
          {(message) => (
            <Show when={textOf(message) !== ""}>
              <li>{`${message.role}: ${textOf(message)}`}</li>
            </Show>
          )}
        </For>
      </ol>
      <Show when={failure()}>{(text) => <p role="alert">{text()}</p>}</Show>
      <form onSubmit={send}>
        <input aria-label="Message" name="message" />
        <button disabled={busy()} type="submit">
          Send
        </button>
        <button disabled={!busy()} onClick={() => turn?.abort()} type="button">
          Stop
        </button>
      </form>
    </section>
  );
}
// #endregion chat
