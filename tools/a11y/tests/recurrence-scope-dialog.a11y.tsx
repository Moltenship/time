import { useState } from "react";
import { describe, expect, test, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import type {
  RecurrenceEditScope,
  RecurrenceScopeAction,
} from "@registry/recurrence-scope-dialog/recurrence-scope-dialog";
import { useRecurrenceScopePrompt } from "@registry/recurrence-scope-dialog/use-recurrence-scope-prompt";

import { seriousViolations, setTheme, themes } from "./axe";
import { render } from "./render";

/** A page with an event that asks, as `onEventChange` would, and shows the answer. */
function Page({
  action = "edit",
  scopes,
}: {
  readonly action?: RecurrenceScopeAction;
  readonly scopes?: readonly RecurrenceEditScope[];
}) {
  const { ask, dialog } = useRecurrenceScopePrompt();
  const [answer, setAnswer] = useState<string>("none yet");

  return (
    <main className="p-4">
      <h1 className="text-lg font-medium">Week</h1>
      <button
        type="button"
        data-event-id="standup"
        className="rounded-md border px-2 py-1"
        onClick={async () => {
          const scope = await ask({ action, eventTitle: "Standup", scopes });
          setAnswer(scope ?? "cancelled");
        }}
      >
        Standup
      </button>
      <output data-testid="answer">{answer}</output>
      {dialog}
    </main>
  );
}

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
const event = () => document.querySelector<HTMLElement>('[data-event-id="standup"]')!;
const answer = () => document.querySelector('[data-testid="answer"]')!.textContent;
const focusedText = () => document.activeElement?.textContent;
const textOf = (ids: string | null) =>
  (ids ?? "")
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");

/** Opens the question from the keyboard, as a keyboard move's Enter would. */
async function openFromKeyboard() {
  event().focus();
  await userEvent.keyboard("{Enter}");
  await vi.waitFor(() => expect(dialog()?.contains(document.activeElement)).toBe(true));
}

describe.each(themes)("recurrence scope dialog, %s theme", (theme) => {
  test.each(["edit", "delete"] as const)("the %s question", async (action) => {
    setTheme(theme);
    await render(<Page action={action} />);
    await openFromKeyboard();

    expect(await seriousViolations()).toEqual([]);
  });
});

test("the dialog is named by its title and described by its question", async () => {
  setTheme("light");
  await render(<Page action="delete" />);
  await openFromKeyboard();

  expect(textOf(dialog()!.getAttribute("aria-labelledby"))).toBe("Delete recurring event");
  expect(textOf(dialog()!.getAttribute("aria-describedby"))).toBe(
    "“Standup” repeats. Which events do you want to delete?",
  );
});

test("Tab and Shift+Tab stay in the dialog, and Enter picks a scope", async () => {
  setTheme("light");
  await render(<Page />);
  await openFromKeyboard();

  expect(focusedText()).toBe("This event");
  const order: (string | undefined)[] = [];
  for (let step = 0; step < 4; step += 1) {
    await userEvent.keyboard("{Tab}");
    order.push(focusedText());
  }
  expect(order).toEqual(["This and following events", "All events", "Cancel", "This event"]);
  await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
  expect(focusedText()).toBe("Cancel");
  await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
  expect(focusedText()).toBe("All events");

  await userEvent.keyboard("{Enter}");

  await vi.waitFor(() => expect(answer()).toBe("all"));
  await vi.waitFor(() => expect(dialog()).toBeNull());
  expect(document.activeElement).toBe(event());
});

test("Escape cancels and focus goes back to the event", async () => {
  setTheme("dark");
  await render(<Page scopes={["following", "all"]} />);
  await openFromKeyboard();

  expect(focusedText()).toBe("This and following events");
  await userEvent.keyboard("{Escape}");

  await vi.waitFor(() => expect(answer()).toBe("cancelled"));
  await vi.waitFor(() => expect(dialog()).toBeNull());
  expect(document.activeElement).toBe(event());
});

test("Space on Cancel cancels", async () => {
  setTheme("light");
  await render(<Page />);
  await openFromKeyboard();
  await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
  expect(focusedText()).toBe("Cancel");

  await userEvent.keyboard(" ");

  await vi.waitFor(() => expect(answer()).toBe("cancelled"));
  await vi.waitFor(() => expect(document.activeElement).toBe(event()));
});
