// @vitest-environment jsdom

import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, expect, test, vi } from "vite-plus/test";

import GoogleCalendarPreview from "../components/google-calendar-preview/calendar";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

let cleanup: (() => void) | undefined;

beforeAll(() => {
  // The fake API answers on its own timers, outside `act`, as a server would; the tests wait for
  // what renders.
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  vi.stubGlobal("matchMedia", () => ({
    addEventListener() {},
    matches: true,
    removeEventListener() {},
  }));
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

async function render() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  root.render(<GoogleCalendarPreview latencyMs={0} />);
  cleanup = () => {
    root.unmount();
    container.remove();
  };
  await vi.waitFor(() =>
    expect(container.querySelector('[data-event-id="review"]')).not.toBeNull(),
  );
  return container;
}

/** The request log, newest first. */
const log = (container: HTMLElement) =>
  [...container.querySelectorAll("ol li")].map((item) => item.textContent ?? "");

function click(container: HTMLElement, label: string) {
  const button = [...container.querySelectorAll("button")].find((found) =>
    found.textContent?.startsWith(label),
  );
  if (button === undefined) throw new Error(`No button "${label}"`);
  button.click();
}

test("syncs from the first week on screen, page by page", async () => {
  const container = await render();
  const requests = log(container);
  expect(requests.at(-1)).toMatch(/^GET events\?timeMin=[^&]+ → 200 4 events, next page$/);
  expect(requests[0]).toMatch(/&pageToken=.+ → 200 \d events?, sync token$/);
  // The stand-up's Wednesday is cancelled in Google, so the week shows four.
  expect(container.querySelectorAll('[data-event-id^="standup"]')).toHaveLength(4);
});

test("syncs when Google says something changed, and syncs again from scratch after a 410", async () => {
  const container = await render();
  click(container, "Move “Design review”");
  await vi.waitFor(() =>
    expect(log(container)[0]).toMatch(/^GET events\?syncToken=.+ → 200 1 event, sync token$/),
  );
  expect(log(container)[1]).toBe("Push notification: X-Goog-Resource-State: exists");
  const panel = container.querySelector('[aria-label="Simulated Google Calendar"]');
  expect(panel?.querySelector('[role="status"]')?.textContent).toBe(
    "In Google Calendar: Move “Design review”",
  );

  click(container, "Expire the sync token");
  click(container, "Sync now");
  // Newest first: the 410, then a full sync from the dates on screen, to its sync token.
  await vi.waitFor(() => {
    const lines = log(container);
    const gone = lines.findIndex((line) => line.endsWith("→ 410 fullSyncRequired"));
    const fullSync = lines.findIndex((line) => /^GET events\?timeMin=[^&]+ → 200/.test(line));
    expect(gone).toBeGreaterThan(0);
    expect(fullSync).toBeGreaterThan(-1);
    expect(fullSync).toBeLessThan(gone);
    expect(lines[0]).toMatch(/sync token$/);
  });
  expect(container.querySelectorAll('[data-event-id^="standup"]')).toHaveLength(4);
});
