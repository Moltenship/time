import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach } from "vite-plus/test";

let mounted: { readonly container: HTMLElement; readonly unmount: () => void } | undefined;

afterEach(() => {
  mounted?.unmount();
  mounted?.container.remove();
  mounted = undefined;
});

/** Renders into the page until the test ends. */
export async function render(element: ReactNode) {
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
