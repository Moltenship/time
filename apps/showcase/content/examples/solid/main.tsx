// #region main
import { render } from "@solidjs/web";

// Chromium and Firefox ship Temporal. Load the polyfill where it's missing, before the calendar.
if (!("Temporal" in globalThis)) await import("temporal-polyfill/global");

const { App } = await import("./app");

render(() => <App />, document.getElementById("root")!);
// #endregion main
