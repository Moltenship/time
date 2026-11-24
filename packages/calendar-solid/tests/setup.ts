import { resetErrorHalt } from "solid-js";
import { afterEach, beforeEach, vi } from "vite-plus/test";

import { cleanup } from "./harness/render";

declare global {
  var __UI_SDK_STRICT__: boolean | undefined;
}

globalThis.__UI_SDK_STRICT__ = true;

// jsdom lacks these, or has them without the parts ui-sdk's behaviors read. Assigned rather than
// `??=`, as the ui-sdk testing guide says, so a partial jsdom version doesn't win.
HTMLElement.prototype.showPopover = function () {};
HTMLElement.prototype.hidePopover = function () {};
Element.prototype.getAnimations = () => [];
Element.prototype.scrollIntoView = function () {};
Element.prototype.checkVisibility = () => true;
Element.prototype.getClientRects = () => [] as unknown as DOMRectList;
document.elementFromPoint = () => null;
document.elementsFromPoint = () => [];
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
document.head.append(
  Object.assign(document.createElement("style"), {
    textContent: "[popover] { display: block !important }",
  }),
);

// Solid 2.0's development build reports misuse (an untracked read in a body, a write in an owned
// scope) on the console without throwing, so any console warning or error fails the test.
const messages: unknown[][] = [];

/** The console output so far, which then no longer fails the test. */
export function takeConsoleMessages(): string[] {
  return messages.splice(0).map((args) => args.join(" "));
}

/**
 * After a render that throws on purpose. An uncaught error halts Solid 2.0's whole reactive system,
 * so every later update in the file would be ignored; this lifts the halt and drops the report,
 * which reaches the console a task later.
 */
export async function recoverFromRenderError(): Promise<void> {
  resetErrorHalt();
  await new Promise((resolve) => setTimeout(resolve, 0));
  takeConsoleMessages();
}

beforeEach(() => {
  messages.length = 0;
  const record = (...args: unknown[]) => void messages.push(args);
  vi.spyOn(console, "warn").mockImplementation(record);
  vi.spyOn(console, "error").mockImplementation(record);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (messages.length > 0) {
    throw new Error(
      `Unexpected console output:\n${messages.map((args) => args.join(" ")).join("\n")}`,
    );
  }
});
