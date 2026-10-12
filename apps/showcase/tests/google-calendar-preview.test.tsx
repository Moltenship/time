// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, expect, test, vi } from "vite-plus/test";

import GoogleCalendarPreview from "../components/google-calendar-preview/calendar";

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

async function render() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(<GoogleCalendarPreview />));
  cleanup = async () => {
    await act(async () => root.unmount());
    container.remove();
  };
  return container;
}

/** The request log, newest first. */
const log = (container: HTMLElement) =>
  [...container.querySelectorAll("ol li")].map((item) => item.textContent ?? "");

async function click(container: HTMLElement, label: string) {
  const button = [...container.querySelectorAll("button")].find((found) =>
    found.textContent?.startsWith(label),
  );
  if (button === undefined) throw new Error(`No button "${label}"`);
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

test("loads the week from the fake API, page by page", async () => {
  const container = await render();
  await vi.waitFor(
    () => expect(container.querySelector('[data-event-id="review"]')).not.toBeNull(),
    {
      timeout: 5000,
    },
  );
  const requests = log(container);
  expect(requests.at(-1)).toMatch(/^GET events\?timeMax=.+&timeMin=.+ → 200 4 events, next page$/);
  expect(requests.some((line) => line.endsWith("sync token"))).toBe(true);
  // The stand-up's Wednesday is cancelled in Google, so the week shows four.
  expect(container.querySelectorAll('[data-event-id^="standup"]')).toHaveLength(4);
});

test("syncs when Google says something changed, and starts again after a 410", async () => {
  const container = await render();
  await vi.waitFor(
    () => expect(container.querySelector('[data-event-id="review"]')).not.toBeNull(),
    {
      timeout: 5000,
    },
  );
  await click(container, "Move “Design review”");
  await vi.waitFor(
    () => expect(log(container)[0]).toMatch(/^GET events\?syncToken=.+ → 200 1 event/),
    {
      timeout: 5000,
    },
  );
  expect(log(container)[1]).toBe("Push notification: X-Goog-Resource-State: exists");

  await click(container, "Expire the sync token");
  await click(container, "Sync now");
  await vi.waitFor(() => expect(log(container)[0]).toMatch(/sync token$/), { timeout: 5000 });
  expect(log(container).some((line) => line.endsWith("→ 410 fullSyncRequired"))).toBe(true);
  expect(container.querySelector('[data-event-id="review"]')).not.toBeNull();
});
