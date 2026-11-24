"use client";

import { registerTools } from "@ui-sdk/react/agent";

import { agent } from "./agent";

/**
 * Hands `snapshot`, `act` and `query` to the browser's own agent. Does nothing in a browser
 * without WebMCP. Returns the function that takes the tools back.
 */
export function registerCalendarTools(): () => void {
  return registerTools(agent, {
    // The browser's agent isn't one you wrote, so it gets an answer of its own for every step,
    // after the bridge's `allow`. Here it may navigate and edit, and never delete.
    allow: ({ action, component, confirm }) =>
      component === "calendar" &&
      confirm === undefined &&
      action !== "deleteEvent" &&
      action !== "setTimeZone",
  });
}

/** Whether this browser takes tools from a page. */
export function hasWebMcp(): boolean {
  const context = (globalThis.document as { modelContext?: { registerTool?: unknown } } | undefined)
    ?.modelContext;
  return typeof context?.registerTool === "function";
}
