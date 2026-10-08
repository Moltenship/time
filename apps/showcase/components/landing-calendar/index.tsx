"use client";

import dynamic from "next/dynamic";

import { CalendarSkeleton } from "./frame";

// Client-only: today, the time zone and the seeded week all come from the visitor's clock.
const LandingCalendar = dynamic(
  async () => {
    // Chrome and Firefox ship Temporal natively; only load the polyfill where it is missing.
    if (!("Temporal" in globalThis)) await import("temporal-polyfill/global");
    // Imported after the polyfill so no calendar module evaluates without Temporal.
    return import("./calendar");
  },
  { loading: CalendarSkeleton, ssr: false },
);

export default LandingCalendar;
