"use client";

import dynamic from "next/dynamic";

import { PreviewSkeleton, withTemporal } from "../calendar-preview/island";

// Client-only: the pretend server's events sit around the visitor's today, in their time zone.
export const QueryPreviewIsland = dynamic(() => withTemporal(() => import("./calendar")), {
  loading: PreviewSkeleton,
  ssr: false,
});
