/// <reference types="vite/client" />
import { render } from "@solidjs/web";
import type { Component } from "solid-js";

// One page runs every example: `?example=agenda` loads `agenda.example.tsx`, which default-exports
// the sample to mount. Each example imports its own stylesheet, so one that shows the package's
// plain elements gets no Tailwind.
const examples = import.meta.glob<{ readonly default: Component }>("./*.example.tsx");

const name = new URLSearchParams(location.search).get("example") ?? "";
const load = examples[`./${name}.example.tsx`];
const root = document.getElementById("root")!;

if (load === undefined) {
  root.textContent = `There is no example named "${name}".`;
} else {
  // Chromium and Firefox ship Temporal. Load the polyfill where it's missing, before the calendar.
  if (!("Temporal" in globalThis)) await import("temporal-polyfill/global");
  const { default: Example } = await load();
  document.title = `${name} · Solid example · Moltenship Time`;
  render(() => <Example />, root);
}
