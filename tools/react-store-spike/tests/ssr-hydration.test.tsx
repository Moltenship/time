// @vitest-environment jsdom

import { act, useState } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, expect, test, vi } from "vite-plus/test";

import { createCalendar } from "../src/index";
import "./setup";

interface TestEvent {
  readonly id: string;
  readonly title: string;
}

interface TestResource {
  readonly id: string;
}

const Calendar = createCalendar<TestEvent, TestResource>();
const events = Object.freeze([{ id: "event-1", title: "Deterministic event" }]);
const resources = Object.freeze([{ id: "resource-1" }]);
let hydratedRoot: Root | undefined;

function Application() {
  const [view, setView] = useState("month");
  return (
    <Calendar.Root
      events={events}
      resources={resources}
      view={view}
      onViewChange={setView}
      anchorDate="2026-08-15"
    >
      <Calendar.Frame>
        <Calendar.Title />
        <Calendar.Event eventIndex={0}>
          {({ event, actions }) => (
            <button onClick={() => actions.setView("week")}>{event.title}</button>
          )}
        </Calendar.Event>
      </Calendar.Frame>
    </Calendar.Root>
  );
}

afterEach(async () => {
  if (hydratedRoot !== undefined) {
    await act(async () => hydratedRoot?.unmount());
    hydratedRoot = undefined;
  }
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

test("server snapshots are deterministic", () => {
  expect(renderToString(<Application />)).toBe(renderToString(<Application />));
});

test("server markup hydrates exactly and remains interactive", async () => {
  const serverMarkup = renderToString(<Application />);
  const container = document.createElement("div");
  container.innerHTML = serverMarkup;
  document.body.append(container);
  const markupBeforeHydration = container.innerHTML;
  const recoverableErrors: unknown[] = [];
  const consoleErrors = vi.spyOn(console, "error").mockImplementation(() => undefined);

  await act(async () => {
    hydratedRoot = hydrateRoot(container, <Application />, {
      onRecoverableError(error) {
        recoverableErrors.push(error);
      },
    });
  });

  expect(container.innerHTML).toBe(markupBeforeHydration);
  expect(recoverableErrors).toEqual([]);
  expect(consoleErrors).not.toHaveBeenCalled();
  expect(container.querySelector('[data-calendar-part="title"]')?.textContent).toBe("month");

  const button = container.querySelector("button");
  await act(async () => button?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

  expect(container.querySelector('[data-calendar-part="title"]')?.textContent).toBe("week");
  expect(recoverableErrors).toEqual([]);
});
