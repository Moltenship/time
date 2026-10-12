// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, expect, test } from "vite-plus/test";

import IcsPlayground from "../components/ics-playground/playground";
import { sampleIcs } from "../components/ics-playground/sample";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

let cleanup: (() => Promise<void>) | undefined;

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

async function render() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(<IcsPlayground />));
  cleanup = async () => {
    await act(async () => root.unmount());
    container.remove();
  };
  return container;
}

async function type(textarea: HTMLTextAreaElement, value: string) {
  await act(async () => {
    // The prototype's setter, so React sees a change rather than its own value.
    Reflect.set(HTMLTextAreaElement.prototype, "value", value, textarea);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

test("labels the text, announces the issue count and resets to the sample", async () => {
  const container = await render();
  const textarea = container.querySelector("textarea")!;
  const status = container.querySelector('[role="status"]')!;

  expect(container.querySelector(`label[for="${textarea.id}"]`)?.textContent).toBe("ICS text");
  expect(textarea.getAttribute("spellcheck")).toBe("false");
  expect(textarea.value).toBe(sampleIcs);
  expect(status.getAttribute("aria-live")).toBe("polite");
  expect(status.textContent).toBe("1 warning");
  expect(container.querySelector('button[aria-label^="Go to line"]')?.textContent).toBe(
    `line ${sampleIcs.split("\n").indexOf("DTSTART:20261019") + 1}`,
  );

  await type(textarea, "");
  expect(status.textContent).toBe("1 error");
  expect(container.querySelector("ol")?.textContent).toContain("No VCALENDAR found");
  expect(container.querySelector("pre")?.textContent).toBe("[]");

  const reset = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "Reset sample",
  )!;
  await act(async () => reset.click());
  expect(textarea.value).toBe(sampleIcs);
  expect(status.textContent).toBe("1 warning");
});

test("selects an issue's line in the text", async () => {
  const container = await render();
  const textarea = container.querySelector("textarea")!;
  const line = container.querySelector<HTMLButtonElement>('button[aria-label^="Go to line"]')!;

  await act(async () => line.click());

  expect(document.activeElement).toBe(textarea);
  expect(textarea.value.slice(textarea.selectionStart, textarea.selectionEnd)).toBe(
    "DTSTART:20261019",
  );
});
