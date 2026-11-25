// #region options
import { createAgent } from "@ui-sdk/solid/agent";

export const agent = createAgent({
  // Optional. Asked before every step; `false` refuses it.
  allow: ({ component, action }) => component === "calendar" && action !== "setTimeZone",
  // Optional. How long a step waits for a promise from `allow`, in milliseconds. 5 minutes by default.
  timeout: 60_000,
});
// #endregion options
