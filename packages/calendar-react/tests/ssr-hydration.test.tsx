// @vitest-environment jsdom

import { act, useState } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, expect, test, vi } from "vite-plus/test";

import { useCalendarStore, useCalendarStoreBinding } from "../src/index";
import "./setup";

type ViewName = "month" | "week";

const defaults = {
  defaultAnchorDate: Temporal.PlainDate.from("2026-08-15"),
  defaultExpandedResourceIds: ["team-a"],
  defaultTimeZone: "Asia/Tbilisi",
  defaultView: "month" as ViewName,
};
let hydratedRoot: Root | undefined;

function Application() {
  const [view, setView] = useState<ViewName>("month");
  const store = useCalendarStore<ViewName, string, string, string>(defaults);
  const calendar = useCalendarStoreBinding(store, {
    controlled: { timeZone: "Asia/Tbilisi", view },
    handlers: { onViewChange: setView },
  });

  return (
    <main
      data-anchor-date={calendar.state.anchorDate.toString()}
      data-time-zone={calendar.state.timeZone}
      data-view={calendar.state.view}
    >
      <output>{calendar.state.view}</output>
      <button onClick={() => calendar.actions.setView("week")} type="button">
        Change view
      </button>
    </main>
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

test("the first client tree matches the server and remains interactive", async () => {
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
  expect(container.querySelector("main")?.dataset).toMatchObject({
    anchorDate: "2026-08-15",
    timeZone: "Asia/Tbilisi",
    view: "month",
  });

  await act(async () => container.querySelector<HTMLButtonElement>("button")?.click());
  expect(container.querySelector("output")?.textContent).toBe("week");
  expect(container.querySelector("main")?.dataset.view).toBe("week");
});
