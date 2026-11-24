import { render } from "@solidjs/web";

import "./style.css";

// Chromium and Firefox ship Temporal; only load the polyfill where it is missing.
if (!("Temporal" in globalThis)) await import("temporal-polyfill/global");

// After the polyfill, so no module evaluates without Temporal. The agent's bridge comes with the
// app, before it renders, so it hears the calendar's root as it is made.
const { App } = await import("./app");
const container = document.getElementById("root");
if (container === null) throw new Error("demo-root-missing");

render(() => <App />, container);
