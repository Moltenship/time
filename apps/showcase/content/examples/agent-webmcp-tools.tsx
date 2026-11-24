"use client";

import { useEffect } from "react";

import { registerCalendarTools } from "./agent-webmcp";

/** Offers the tools to the browser's agent while this component is on the page. */
export function WebMcpTools() {
  // The function `registerCalendarTools` returns takes the tools back on unmount.
  useEffect(() => registerCalendarTools(), []);
  return null;
}
