import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";

declare global {
  interface Window {
    /** Set once the page has rendered its events and its fonts have loaded. */
    demoParityReady?: boolean;
  }
}

export async function mountDemoPage(app: ReactNode) {
  createRoot(document.getElementById("root")!).render(app);
  await document.fonts.ready;
  while (document.querySelector("main [data-event-id]") === null) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  window.demoParityReady = true;
}
