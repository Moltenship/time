import { render as renderRoot, type JSX } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach } from "vite-plus/test";

import { cameToRest } from "../waits";

export { inWebKit, shiftTab, tab } from "../keys";
export { until } from "../waits";

let mounted: (() => void) | undefined;

afterEach(() => {
  mounted?.();
  mounted = undefined;
});

/** Settles Solid's writes, which land on the next microtask in Solid 2.0, and their effects. */
export async function settled(): Promise<void> {
  flush();
  await Promise.resolve();
  flush();
}

/** Renders into the page until the test ends or the next render. */
export async function render(code: () => JSX.Element) {
  mounted?.();
  const container = document.createElement("div");
  document.body.append(container);
  const dispose = renderRoot(code, container);
  mounted = () => {
    dispose();
    container.remove();
  };
  await settled();
}

/** Presses a key on the focused element, as a keyboard would. */
export async function press(key: string) {
  (document.activeElement ?? document.body).dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }),
  );
  await settled();
}

export const atRest = (element: HTMLElement, frames = 5): Promise<void> =>
  cameToRest(element, frames, settled);
