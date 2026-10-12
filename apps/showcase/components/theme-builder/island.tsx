"use client";

import dynamic from "next/dynamic";

import { PreviewSkeleton, withTemporal } from "@/components/calendar-preview/island";

// Client-only, like the other previews: today and the time zone come from the visitor's clock.
export const ThemeCalendarIsland = dynamic(() => withTemporal(() => import("./calendar")), {
  loading: PreviewSkeleton,
  ssr: false,
});
