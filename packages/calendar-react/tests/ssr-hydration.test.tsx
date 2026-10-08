// @vitest-environment jsdom

import { act, useState } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, expect, test, vi } from "vite-plus/test";

import { gateAnchorDate, gateEvents, gateTimeZone, gateWeekRules } from "./harness/builders";
import { GateCalendar, type GateView } from "./harness/custom-view-fixture";
import "./setup";

let hydratedRoot: Root | undefined;

function Probe() {
  const calendar = GateCalendar.useCalendar();
  return (
    <main
      data-anchor-date={calendar.state.anchorDate.toString()}
      data-time-zone={calendar.state.timeZone}
      data-view={calendar.state.view}
    >
      <GateCalendar.ActiveView />
      <button onClick={() => calendar.actions.setView("agenda")} type="button">
        Change view
      </button>
    </main>
  );
}

function Application() {
  const [view, setView] = useState<GateView>("month");
  return (
    <GateCalendar.Root
      defaultAnchorDate={gateAnchorDate}
      events={gateEvents}
      locale="en-GB"
      onViewChange={setView}
      timeZone={gateTimeZone}
      view={view}
      weekRules={gateWeekRules}
    >
      <Probe />
    </GateCalendar.Root>
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
  expect(container.querySelector("main")?.dataset.view).toBe("agenda");
  expect(container.querySelector("[data-gate-view]")?.getAttribute("data-gate-view")).toBe(
    "agenda",
  );
});
