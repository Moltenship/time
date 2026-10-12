import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach } from "vite-plus/test";
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
