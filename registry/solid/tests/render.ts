import { render as renderRoot, type JSX } from "@solidjs/web";
import { flush } from "solid-js";

const mounted = new Set<() => void>();

// Signal writes land on the next microtask in Solid 2.0; settle them before reading the DOM.
export async function settled(): Promise<void> {
  flush();
  await Promise.resolve();
  flush();
}

/** Renders `code` into a container in the document; `setup.ts` removes it after the test. */
export async function render(code: () => JSX.Element) {
  const container = document.createElement("div");
  document.body.append(container);
  const dispose = renderRoot(code, container);
  const unmount = () => {
    if (!mounted.delete(unmount)) return;
    dispose();
    container.remove();
  };
  mounted.add(unmount);
  await settled();
  return { container, unmount };
}

export function cleanup(): void {
  for (const unmount of mounted) unmount();
}

export async function click(element: Element | null) {
  element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await settled();
}

/** A key pressed where focus is. */
export async function press(key: string, init: KeyboardEventInit = {}) {
  (document.activeElement ?? document.body).dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, ...init }),
  );
  await settled();
}

export async function focus(element: Element | null) {
  (element as HTMLElement | null)?.focus();
  await settled();
}
