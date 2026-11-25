import { afterEach, beforeEach, vi } from "vite-plus/test";

import { cleanup } from "./render";

// jsdom has no ResizeObserver; the agenda's virtualizer observes its rows with one.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView = function () {};

// Solid 2.0's development build reports misuse (an untracked read in a body, a write in an owned
// scope) on the console without throwing, so any console warning or error fails the test.
const messages: unknown[][] = [];

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
