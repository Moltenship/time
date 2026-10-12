// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, expect, test, vi } from "vite-plus/test";

import { createRecurringPreviewEvents } from "../components/recurrence-preview/events";
import { TeamCalendar } from "../content/examples/recurrence-root";

import { TooltipProvider } from "@registry/ui/tooltip";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

let cleanup: (() => Promise<void>) | undefined;

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("matchMedia", () => ({
    addEventListener() {},
    matches: true,
    removeEventListener() {},
  }));
});

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

const timeZone = "Europe/Berlin";

async function render() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const events = createRecurringPreviewEvents(Temporal.Now.zonedDateTimeISO(timeZone));
  await act(async () =>
    root.render(
      <TooltipProvider>
        <TeamCalendar initialEvents={events} timeZone={timeZone} />
      </TooltipProvider>,
    ),
  );
  cleanup = async () => {
    await act(async () => root.unmount());
    container.remove();
  };
  return container;
}

async function click(element: Element | null | undefined) {
  if (element == null) throw new Error("Nothing to click");
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

const ids = (container: HTMLElement, prefix: string) =>
  [...container.querySelectorAll(`[data-event-id^="${prefix}"]`)].map((element) =>
    element.getAttribute("data-event-id"),
  );

const deleteButton = (container: HTMLElement) =>
  [...container.querySelectorAll("button")].find((button) => button.textContent === "Delete");

/** Selects an event, deletes it, and answers the scope dialog with `scope`, or cancels it. */
async function deleteEvent(container: HTMLElement, id: string, scope: string | null) {
  await click(container.querySelector(`[data-event-id="${id}"]`));
  await click(deleteButton(container));
  const dialog = document.querySelector('[role="dialog"]');
  expect(dialog?.textContent).toContain("Which events do you want to delete?");
  await click(
    scope === null
      ? [...dialog!.querySelectorAll("button")].find((button) => button.textContent === "Cancel")
      : dialog!.querySelector(`[data-scope="${scope}"]`),
  );
}

test("deleting one occurrence of a series asks for a scope and removes only it", async () => {
  const container = await render();
  const standups = ids(container, "standup::");
  expect(standups).toHaveLength(4);

  await deleteEvent(container, standups[1]!, "this");

  expect(ids(container, "standup::")).toEqual(standups.filter((id) => id !== standups[1]));
});

test('"All events" deletes the series with its moved occurrence', async () => {
  const container = await render();
  await deleteEvent(container, ids(container, "standup::")[0]!, "all");

  expect(ids(container, "standup::")).toEqual([]);
  expect(ids(container, "planning::")).toHaveLength(1);
});

test("cancelling the dialog keeps the occurrence", async () => {
  const container = await render();
  const [planning] = ids(container, "planning::");

  await deleteEvent(container, planning!, null);

  expect(ids(container, "planning::")).toEqual([planning]);
});

test("a series' first occurrence offers no 'This and following events'", async () => {
  const container = await render();
  await click(container.querySelector('[data-event-id^="one-on-one::"]'));
  await click(deleteButton(container));

  const scopes = [...document.querySelectorAll("[data-scope]")].map((button) =>
    button.getAttribute("data-scope"),
  );
  expect(scopes).toEqual(["this", "all"]);
});

test("a one-off event is deleted without a question", async () => {
  const container = await render();
  await click(container.querySelector('[data-event-id="offsite-prep"]'));
  await click(deleteButton(container));

  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(ids(container, "offsite-prep")).toEqual([]);
});
