import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach } from "vite-plus/test";

import { abandoned, cameToRest, clip, timedOut } from "./waits";

export { inWebKit, shiftTab, tab } from "./keys";
export { nextFrame, until } from "./waits";

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

/** Resolves once `element` has left the page, as a popup does after its exit animation. */
export async function removed(element: Element): Promise<void> {
  let over = false;
  const what = clip(element.outerHTML, 120);
  const test = timedOut(() =>
    over
      ? undefined
      : element.isConnected
        ? `${what} to leave the page`
        : `the work ${what} set off as it left`,
  );
  try {
    if (element.isConnected) {
      const left = await new Promise<boolean>((resolve) => {
        const observer = new MutationObserver(() => {
          if (test.aborted) resolve(false);
          else if (!element.isConnected) resolve(true);
          else return;
          observer.disconnect();
        });
        // The document, and the shadow root it was portalled into if any, which can leave the
        // document with its host.
        const root = element.getRootNode();
        observer.observe(document.documentElement, { childList: true, subtree: true });
        if (root instanceof ShadowRoot) observer.observe(root, { childList: true, subtree: true });
      });
      if (!left) return abandoned();
    }
    // What the unmount set off, such as focus going back, runs in a microtask and React work.
    await act(async () => {});
    if (test.aborted) return abandoned();
    over = true;
  } finally {
    test.done();
  }
}

/**
 * Resolves once `element` has come to rest: its last scroll has ended, and it hasn't moved for
 * `frames` frames in a row, so a snap or a correction the view starts at the end has run too.
 * Frames, not milliseconds, so a slow machine waits longer instead of looking too early. It also
 * compares the scroll position each frame, which catches movement that comes without a scroll
 * event.
 */
export const atRest = (element: HTMLElement, frames = 5): Promise<void> =>
  cameToRest(element, frames, () => act(async () => {}));
