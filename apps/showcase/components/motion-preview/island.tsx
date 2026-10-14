"use client";

import dynamic from "next/dynamic";

import { PreviewSkeleton, withTemporal } from "../calendar-preview/island";

// Client-only, as the other previews: Temporal loads in the browser where it is missing.
export const MotionPreviewIsland = dynamic(() => withTemporal(() => import("./calendar")), {
  loading: PreviewSkeleton,
  ssr: false,
});
