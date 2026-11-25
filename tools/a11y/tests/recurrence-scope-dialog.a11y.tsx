import { useState } from "react";
import { describe, expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import type {
  RecurrenceEditScope,
  RecurrenceScopeAction,
} from "@registry/recurrence-scope-dialog/recurrence-scope-dialog";
import { useRecurrenceScopePrompt } from "@registry/recurrence-scope-dialog/use-recurrence-scope-prompt";

import { seriousViolations, setTheme, themes } from "./axe";
import { render, shiftTab, tab, until } from "./render";

/** A page with an event that asks, as `onEventChange` would, and shows the answer. */
function Page({
  action = "edit",
  dir,
  scopes,
}: {
  readonly action?: RecurrenceScopeAction;
  readonly dir?: "ltr" | "rtl";
  readonly scopes?: readonly RecurrenceEditScope[];
}) {
  const { ask, dialog } = useRecurrenceScopePrompt();
  const [answer, setAnswer] = useState<string>("none yet");

  return (
    <main className="p-4" dir={dir}>
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
const focusReaches = (text: string) => until(() => expect(focusedText()).toBe(text));
const textOf = (ids: string | null) =>
  (ids ?? "")
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");

/** Opens the question from the keyboard, as a keyboard move's Enter would. */
async function openFromKeyboard() {
  event().focus();
  await userEvent.keyboard("{Enter}");
  await until(() => expect(dialog()?.contains(document.activeElement)).toBe(true));
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

  // Modal: the page behind is out of reach, for a pointer and assistive technology alike.
  await until(() => expect(event().closest("[inert]")).not.toBeNull());
  expect(textOf(dialog()!.getAttribute("aria-labelledby"))).toBe("Delete recurring event");
  expect(textOf(dialog()!.getAttribute("aria-describedby"))).toBe(
    "“Standup” repeats. Which events do you want to delete?",
  );
});

test("Tab and Shift+Tab stay in the dialog, and Enter picks a scope", async () => {
  setTheme("light");
  await render(<Page />);
  await openFromKeyboard();

  await focusReaches("This event");
  for (const text of ["This and following events", "All events", "Cancel", "This event"]) {
    await userEvent.keyboard(tab);
    await focusReaches(text);
  }
  await userEvent.keyboard(shiftTab);
  await focusReaches("Cancel");
  await userEvent.keyboard(shiftTab);
  await focusReaches("All events");

  await userEvent.keyboard("{Enter}");

  await until(() => expect(answer()).toBe("all"));
  await until(() => expect(dialog()).toBeNull());
  expect(document.activeElement).toBe(event());
});

test("the arrow keys move between the scopes and wrap at the ends", async () => {
  setTheme("light");
  await render(<Page />);
  await openFromKeyboard();

  await focusReaches("This event");
  for (const [key, text] of [
    ["{ArrowDown}", "This and following events"],
    ["{ArrowDown}", "All events"],
    ["{ArrowDown}", "This event"],
    ["{ArrowUp}", "All events"],
    ["{ArrowLeft}", "This and following events"],
    ["{ArrowRight}", "All events"],
  ] as const) {
    await userEvent.keyboard(key);
    await focusReaches(text);
  }

  await userEvent.keyboard("{Enter}");
  await until(() => expect(answer()).toBe("all"));
});

test("right to left, Left moves on and Right moves back", async () => {
  setTheme("dark");
  await render(<Page dir="rtl" />);
  await openFromKeyboard();

  await focusReaches("This event");
  await userEvent.keyboard("{ArrowLeft}");
  await focusReaches("This and following events");
  await userEvent.keyboard("{ArrowRight}");
  await focusReaches("This event");
  await userEvent.keyboard("{ArrowRight}");
  await focusReaches("All events");
});

test("Escape cancels and focus goes back to the event", async () => {
  setTheme("dark");
  await render(<Page scopes={["following", "all"]} />);
  await openFromKeyboard();

  await focusReaches("This and following events");
  await userEvent.keyboard("{Escape}");

  await until(() => expect(answer()).toBe("cancelled"));
  await until(() => expect(dialog()).toBeNull());
  expect(document.activeElement).toBe(event());
});

test("Space on Cancel cancels", async () => {
  setTheme("light");
  await render(<Page />);
  await openFromKeyboard();
  await focusReaches("This event");
  await userEvent.keyboard(shiftTab);
  await focusReaches("Cancel");

  await userEvent.keyboard(" ");

  await until(() => expect(answer()).toBe("cancelled"));
  await until(() => expect(document.activeElement).toBe(event()));
});
