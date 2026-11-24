"use client";

import { createAgent } from "@ui-sdk/react/agent";

// Once, in the browser. It finds the calendars already on the page and hears new ones.
export const agent = createAgent();
