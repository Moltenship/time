// #region tools
import { onSettled } from "solid-js";

import { registerCalendarTools } from "./agent-webmcp";

/** Offers the tools to the browser's agent while this component is on the page. */
export function WebMcpTools() {
  // In the browser, once the component is on the page. The function `registerCalendarTools`
  // returns takes the tools back when the component leaves.
  onSettled(() => registerCalendarTools());
  return null;
}
// #endregion tools
