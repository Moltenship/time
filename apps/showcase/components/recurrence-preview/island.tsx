"use client";

import dynamic from "next/dynamic";

import { PreviewSkeleton, withTemporal } from "../calendar-preview/island";

// Client-only: the series are seeded around the visitor's week, in their time zone.
export const RecurrencePreviewIsland = dynamic(() => withTemporal(() => import("./calendar")), {
  loading: PreviewSkeleton,
  ssr: false,
});
