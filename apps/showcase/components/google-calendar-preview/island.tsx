"use client";

import dynamic from "next/dynamic";

import { PreviewSkeleton, withTemporal } from "../calendar-preview/island";

// Client-only: the fake Google calendar is seeded around the visitor's week, in their time zone.
export const GoogleCalendarPreviewIsland = dynamic(() => withTemporal(() => import("./calendar")), {
  loading: PreviewSkeleton,
  ssr: false,
});
