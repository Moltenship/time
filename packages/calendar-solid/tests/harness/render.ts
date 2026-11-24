import { render, type JSX } from "@solidjs/web";
import { flush } from "solid-js";

export interface Mounted {
  readonly container: HTMLDivElement;
  dispose(): void;
}

const mounted = new Set<Mounted>();

// Solid's render attaches synchronously when nothing is async, so the DOM is ready on return.
export function mount(code: () => JSX.Element): Mounted {
  const container = document.createElement("div");
  document.body.append(container);
  const disposeRoot = render(code, container);
  const view: Mounted = {
    container,
    dispose() {
      if (!mounted.delete(view)) return;
      disposeRoot();
      container.remove();
    },
  };
  mounted.add(view);
  return view;
}

export function cleanup(): void {
  // Deleting the current entry while iterating a Set is safe.
  for (const view of mounted) view.dispose();
}

// Signal writes land on the next microtask in Solid 2.0; settle them before reading the DOM.
export async function settled(): Promise<void> {
  flush();
  await Promise.resolve();
  flush();
}

export function press(target: Element, key: string, init: KeyboardEventInit = {}): void {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
  );
}

export function click(target: Element): void {
  (target as HTMLElement).click();
}
