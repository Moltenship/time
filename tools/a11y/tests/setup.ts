import { afterEach } from "vite-plus/test";
import { cdp, server, userEvent } from "vite-plus/test/browser";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
  /** Set by `vite.config.ts` when the run is on a GitHub runner. */
  const __ON_GITHUB_RUNNER__: boolean;
}

/**
 * How many times slower than an Apple-silicon laptop a GitHub runner ran these tests, from the
 * same tests' timings in both places.
 */
const CI_SLOWDOWN = 6;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// React warns about each update outside `act()`, and a suspended resource that loads outside it.
// Real input from Playwright lands outside it by design, so here the warning says nothing, and it
// came thousands of times a file: each one went to Node through Vitest's console, which cost a
// popover test more time than the popover did.
const consoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  if (typeof args[0] === "string" && args[0].includes("not wrapped in act(")) return;
  consoleError(...args);
};
// The demo's page declares its language; axe checks the test page the same way.
document.documentElement.lang = "en";

// `vp run a11y:ci-speed` slows Chromium down to a CI runner's speed, so a test that only fails on
// a slow machine fails here too. On a runner, which is that speed, it runs as it is: the release
// workflow runs the full tier there.
if (import.meta.env.MODE === "ci-speed" && server.browser === "chromium" && !__ON_GITHUB_RUNNER__) {
  await cdp().send("Emulation.setCPUThrottlingRate", { rate: CI_SLOWDOWN });
}

// `vp run browsers` runs WebKit on temporal-polyfill, as an app would for a browser without
// Temporal: the native one goes, and the polyfill takes its place before any test imports.
if (import.meta.env.MODE === "browsers" && server.browser === "webkit") {
  delete (globalThis as { Temporal?: unknown }).Temporal;
  await import("temporal-polyfill/global");
}

// The mouse stays where a test leaves it, over whatever the next test renders there, which it
// would hover. Each test ends with the mouse parked on a corner of its own, above the page. The
// corner never moves, so the move skips Playwright's checks, which wait for frames, and a page
// that doesn't take the move in 10 seconds fails the test instead of holding up the run.
const corner = document.createElement("div");
corner.setAttribute("aria-hidden", "true");
corner.style.cssText =
  "position: fixed; top: 0; left: 0; z-index: 2147483647; width: 1px; height: 1px";
document.body.append(corner);
afterEach(async () => {
  await userEvent.hover(corner, { force: true, timeout: 10_000 });
});
