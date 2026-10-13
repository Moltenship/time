import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, TestRunner } from "vite-plus/test";
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
 * The running test's signal. Vitest aborts it when the test times out, before the `afterEach`
 * hooks clean the page up, so a wait the test left behind can say what it was waiting for, and
 * then stop instead of acting on the next test's page.
 */
function timedOut(what: () => unknown): { readonly aborted: boolean } {
  const signal = TestRunner.getCurrentTest()?.context.signal;
  signal?.addEventListener(
    "abort",
    () => {
      // `undefined` once the wait is over.
      const waiting = what();
      if (waiting !== undefined) console.error("Still waiting for:", waiting);
    },
    { once: true },
  );
  return {
    get aborted() {
      return signal?.aborted ?? false;
    },
  };
}

/** A wait the test has left behind: it never resolves, so nothing after it runs. */
const abandoned = () => new Promise<never>(() => {});

/**
 * Waits until `check` passes, trying once a frame. It sets no deadline of its own: how long a step
 * takes depends on the machine, so the test's timeout bounds it, and the watchdog a stuck page.
 */
export async function until(check: () => void): Promise<void> {
  let last: unknown = "the check to pass";
  const test = timedOut(() => last);
  for (;;) {
    if (test.aborted) return abandoned();
    let result: unknown;
    try {
      result = check();
    } catch (error) {
      last = error;
      await nextFrame();
      continue;
    }
    last = undefined;
    if (typeof (result as { then?: unknown } | undefined)?.then === "function") {
      throw new TypeError("until() takes a check that passes or throws, not a promise");
    }
    return;
  }
}

/** Resolves once `element` has left the page, as a popup does after its exit animation. */
export async function removed(element: Element): Promise<void> {
  if (element.isConnected) {
    const test = timedOut(() =>
      element.isConnected ? `${element.outerHTML.slice(0, 120)}… to leave the page` : undefined,
    );
    // Its root: the document, or a shadow root it was portalled into.
    const root = element.getRootNode();
    const left = await new Promise<boolean>((resolve) => {
      const observer = new MutationObserver(() => {
        if (test.aborted) resolve(false);
        else if (!element.isConnected) resolve(true);
        else return;
        observer.disconnect();
      });
      observer.observe(root instanceof Document ? root.documentElement : root, {
        childList: true,
        subtree: true,
      });
    });
    if (!left) return abandoned();
  }
  // What the unmount set off, such as focus going back, runs in a microtask and React work.
  await act(async () => {});
}

/**
 * Resolves once `element` has come to rest: its last scroll has ended, and it hasn't moved for
 * `frames` frames in a row, so a snap or a correction the view starts at the end has run too.
 * Frames, not milliseconds, so a slow machine waits longer instead of looking too early. It
 * compares the scroll position each frame too, so a scroll that ended before it started
 * listening still counts.
 */
export async function atRest(element: HTMLElement, frames = 5): Promise<void> {
  let resting = false;
  const test = timedOut(() =>
    resting ? undefined : `${element.dataset.slot ?? element.tagName} to come to rest`,
  );
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
    let position = `${element.scrollLeft},${element.scrollTop}`;
    while (quiet < frames || (moving && quiet < 30)) {
      await nextFrame();
      if (test.aborted) return abandoned();
      const now = `${element.scrollLeft},${element.scrollTop}`;
      quiet = now === position ? quiet + 1 : 0;
      position = now;
    }
  } finally {
    element.removeEventListener("scroll", onScroll);
    element.removeEventListener("scrollend", onEnd);
  }
  resting = true;
  await act(async () => {});
}
