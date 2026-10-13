import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, onTestFailed } from "vite-plus/test";
import { server } from "vite-plus/test/browser";

/** Whether the run is in WebKit, which skips the tests #181 tracks. */
export const inWebKit = server.browser === "webkit";

let mounted: { readonly container: HTMLElement; readonly unmount: () => void } | undefined;

afterEach(() => {
  mounted?.unmount();
  mounted?.container.remove();
  mounted = undefined;
});

/** Renders into the page until the test ends or the next render. */
export async function render(element: ReactNode) {
  mounted?.unmount();
  mounted?.container.remove();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  mounted = { container, unmount: () => act(() => root.unmount()) };
}

export async function click(element: HTMLElement | null | undefined) {
  if (element == null) throw new Error("click-target-missing");
  await act(async () => element.click());
}

/** Presses a key on the focused element, as a keyboard would. */
export async function press(key: string) {
  const target = document.activeElement ?? document.body;
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }));
  });
}

/** Resolves on the next animation frame. */
export const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Waits until `check` passes, trying once a frame. It sets no deadline of its own: how long a step
 * takes depends on the machine, so the test's timeout bounds it, and the watchdog a stuck page.
 */
export async function until(check: () => void): Promise<void> {
  let pending: { error: unknown } | undefined;
  for (;;) {
    try {
      check();
      if (pending !== undefined) pending.error = undefined;
      return;
    } catch (error) {
      if (pending === undefined) {
        const waiting = (pending = { error });
        // A check that never passes ends in the test's timeout: say which one it was.
        onTestFailed(() => {
          if (waiting.error !== undefined) console.error("Still waiting for:", waiting.error);
        });
      }
      pending.error = error;
      await nextFrame();
    }
  }
}

/** Resolves once `element` has left the page, as a popup does after its exit animation. */
export async function removed(element: Element): Promise<void> {
  if (element.isConnected) {
    await new Promise<void>((resolve) => {
      const observer = new MutationObserver(() => {
        if (element.isConnected) return;
        observer.disconnect();
        resolve();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }
  // What the unmount set off, such as focus going back, runs in a microtask and React work.
  await act(async () => {});
}

/**
 * Resolves once `element` has come to rest: its last scroll has ended, and it hasn't scrolled for
 * `frames` frames in a row, so a snap or a correction the view starts at the end has run too.
 * Frames, not milliseconds, so a slow machine waits longer instead of looking too early.
 */
export async function atRest(element: HTMLElement, frames = 5): Promise<void> {
  let quiet = 0;
  // A scroll that hasn't reported its end. Without `scrollend`, 30 still frames end it.
  let moving = false;
  const onScroll = () => {
    quiet = 0;
    moving = true;
  };
  const onEnd = () => {
    quiet = 0;
    moving = false;
  };
  element.addEventListener("scroll", onScroll, { passive: true });
  element.addEventListener("scrollend", onEnd);
  try {
    while (quiet < frames || (moving && quiet < 30)) {
      await nextFrame();
      quiet += 1;
    }
  } finally {
    element.removeEventListener("scroll", onScroll);
    element.removeEventListener("scrollend", onEnd);
  }
  await act(async () => {});
}
