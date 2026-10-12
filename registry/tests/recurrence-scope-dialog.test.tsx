// @vitest-environment jsdom

import { act, useEffect } from "react";
import { afterEach, expect, test, vi } from "vite-plus/test";

import type { RecurrenceEditScope } from "../recurrence-scope-dialog/recurrence-scope-dialog";
import {
  useRecurrenceScopePrompt,
  type RecurrenceScopePrompt,
  type RecurrenceScopeQuestion,
} from "../recurrence-scope-dialog/use-recurrence-scope-prompt";
import { click, press, render } from "./render";

type Ask = RecurrenceScopePrompt["ask"];

/** Every `ask` the host rendered with, newest last. */
let asks: Ask[] = [];
let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
  asks = [];
});

/** An app with an event button and the prompt, as a calendar page would have them. */
function Host() {
  const { ask, dialog } = useRecurrenceScopePrompt();
  useEffect(() => {
    asks.push(ask);
  });
  return (
    <>
      <button type="button" data-event-id="standup">
        Standup
      </button>
      {dialog}
    </>
  );
}

async function renderHost() {
  const view = await render(<Host />);
  cleanup = view.unmount;
  return view;
}

/**
 * Asks through the host's prompt. The answer comes back wrapped, so awaiting this doesn't wait on
 * it.
 */
async function ask(question?: RecurrenceScopeQuestion) {
  let answer!: Promise<RecurrenceEditScope | null>;
  await act(async () => {
    answer = asks.at(-1)!(question);
  });
  return { answer };
}

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
const choice = (scope: RecurrenceEditScope) =>
  document.querySelector<HTMLElement>(`[role="dialog"] [data-scope="${scope}"]`);
const choices = () =>
  [...document.querySelectorAll('[data-slot="recurrence-scope-choices"] button')].map(
    (button) => button.textContent,
  );
const cancel = () =>
  [...document.querySelectorAll<HTMLElement>('[role="dialog"] button')].find(
    (button) => button.textContent === "Cancel",
  ) ?? null;
const textOf = (ids: string | null | undefined) =>
  (ids ?? "")
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");

test.each(["this", "following", "all"] as const)(
  "resolves %s when its button is picked",
  async (scope) => {
    await renderHost();
    const { answer } = await ask();

    await click(choice(scope));

    await expect(answer).resolves.toBe(scope);
    await vi.waitFor(() => expect(dialog()).toBeNull());
  },
);

test("Cancel and Escape resolve null", async () => {
  await renderHost();
  const { answer: cancelled } = await ask();
  await click(cancel());
  await expect(cancelled).resolves.toBeNull();
  await vi.waitFor(() => expect(dialog()).toBeNull());

  const { answer: escaped } = await ask();
  await vi.waitFor(() => expect(dialog()?.contains(document.activeElement)).toBe(true));
  await press(document.activeElement, "Escape");
  await expect(escaped).resolves.toBeNull();
  await vi.waitFor(() => expect(dialog()).toBeNull());
});

test("offers all three scopes by default, from the narrowest", async () => {
  await renderHost();
  await ask();

  expect(choices()).toEqual(["This event", "This and following events", "All events"]);
});

test("scopes filters the choices and keeps their order", async () => {
  await renderHost();
  await ask({ scopes: ["all", "this", "all"] });

  expect(choices()).toEqual(["This event", "All events"]);
});

test("a single scope still asks", async () => {
  await renderHost();
  const { answer } = await ask({ action: "delete", scopes: ["all"] });

  expect(choices()).toEqual(["All events"]);
  await click(choice("all"));
  await expect(answer).resolves.toBe("all");
});

test("no scopes resolves null at once, without a dialog", async () => {
  await renderHost();

  await expect((await ask({ scopes: [] })).answer).resolves.toBeNull();
  expect(dialog()).toBeNull();
});

test("asking again resolves the open question with null and shows the new one", async () => {
  await renderHost();
  const { answer: first } = await ask({ eventTitle: "Standup" });
  const { answer: second } = await ask({ action: "delete", eventTitle: "Retro" });

  await expect(first).resolves.toBeNull();
  expect(textOf(dialog()!.getAttribute("aria-labelledby"))).toBe("Delete recurring event");
  await click(choice("following"));
  await expect(second).resolves.toBe("following");
});

test("unmounting resolves an open question with null", async () => {
  const view = await renderHost();
  const { answer } = await ask();

  await view.unmount();
  cleanup = undefined;

  await expect(answer).resolves.toBeNull();
});

test("ask is the same function on every render", async () => {
  const view = await renderHost();
  const { answer } = await ask();
  await click(choice("this"));
  await answer;
  await view.rerender(<Host />);

  expect(asks.length).toBeGreaterThan(2);
  expect(new Set(asks).size).toBe(1);
});

test("the dialog is named by its title and described by its question", async () => {
  await renderHost();
  await ask();

  // Modal: the page behind is out of reach for assistive technology.
  expect(
    document.querySelector('[data-event-id="standup"]')!.closest('[aria-hidden="true"], [inert]'),
  ).not.toBeNull();
  expect(textOf(dialog()!.getAttribute("aria-labelledby"))).toBe("Edit recurring event");
  expect(textOf(dialog()!.getAttribute("aria-describedby"))).toBe(
    "This event repeats. Which events should this change apply to?",
  );
});

test("a delete asks a different question, quoting the event's title", async () => {
  await renderHost();
  await ask({ action: "delete", eventTitle: "Standup" });

  expect(textOf(dialog()!.getAttribute("aria-labelledby"))).toBe("Delete recurring event");
  expect(textOf(dialog()!.getAttribute("aria-describedby"))).toBe(
    "“Standup” repeats. Which events do you want to delete?",
  );
});

test("focus starts on the narrowest scope offered and returns where it was", async () => {
  await renderHost();
  const event = document.querySelector<HTMLElement>('[data-event-id="standup"]')!;
  await act(async () => event.focus());

  const { answer } = await ask();
  await vi.waitFor(() => expect(document.activeElement).toBe(choice("this")));
  await click(cancel());
  await answer;
  await vi.waitFor(() => expect(document.activeElement).toBe(event));

  await ask({ scopes: ["all", "following"] });
  await vi.waitFor(() => expect(document.activeElement).toBe(choice("following")));
});

test("Tab past either end of the dialog wraps around inside it", async () => {
  await renderHost();
  await ask();
  await vi.waitFor(() => expect(document.activeElement).toBe(choice("this")));
  // Base UI's focus guards sit either side of the popup and take Tab's focus first.
  const guards = [...document.querySelectorAll<HTMLElement>("[data-base-ui-focus-guard]")].filter(
    (guard) => guard.closest('[role="dialog"]') === null,
  );
  const after = guards.at(-1)!;
  const before = guards.find(
    (guard) => guard.compareDocumentPosition(dialog()!) & Node.DOCUMENT_POSITION_FOLLOWING,
  )!;

  await act(async () => after.focus());
  await vi.waitFor(() => expect(document.activeElement).toBe(choice("this")));
  await act(async () => before.focus());
  await vi.waitFor(() => expect(document.activeElement).toBe(cancel()));
});
