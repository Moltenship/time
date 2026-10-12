"use client";

import dynamic from "next/dynamic";

import { PreviewSkeleton, withTemporal } from "../calendar-preview/island";

// Client-only: the feed is written for the visitor's week, in their time zone.
export const IcsFeedCalendarIsland = dynamic(() => withTemporal(() => import("./calendar")), {
  loading: PreviewSkeleton,
  ssr: false,
});

export const IcsFeedSourceIsland = dynamic(() => withTemporal(() => import("./source")), {
  loading: () => <p className="px-4 py-3 text-sm text-fd-muted-foreground">Writing the feed…</p>,
  ssr: false,
});
