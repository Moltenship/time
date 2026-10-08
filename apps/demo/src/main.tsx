import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./styles.css";

// Chrome and Firefox ship Temporal natively; only load the polyfill where it is missing.
if (!("Temporal" in globalThis)) await import("temporal-polyfill/global");

// Imported after the polyfill so no module evaluates without Temporal.
const { App } = await import("./app");
const container = document.getElementById("root");
if (container === null) throw new Error("demo-root-missing");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
