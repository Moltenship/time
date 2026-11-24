import { createAgent, registerTools } from "@ui-sdk/solid/agent";

/**
 * The page's one bridge. Made before anything renders, since it hears components as they are made.
 * The application owns it: the calendar package only describes its root to whatever bridge exists.
 */
export const agent = createAgent();

/**
 * WebMCP hands the bridge's three tools (snapshot, query, act) to the browser's own agent. Only some
 * browsers have it, behind a flag, so it is feature-detected.
 */
function registerWebMcp(): "registered" | "unavailable" {
  if (!("modelContext" in document)) return "unavailable";
  registerTools(agent, { allow: () => true });
  return "registered";
}

export const webMcp = registerWebMcp();
