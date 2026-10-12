"use client";

import dynamic from "next/dynamic";

import { withTemporal } from "@/components/calendar-preview/island";

/** Static stand-in that fills the frame while Temporal and the parser load in the browser. */
function PlaygroundSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading playground"
      className="grid h-full grid-rows-[18rem_minmax(0,1fr)] @2xl:grid-cols-2 @2xl:grid-rows-1"
    >
      <div className="flex flex-col border-b @2xl:border-r @2xl:border-b-0">
        <div className="flex h-11 items-center border-b px-3">
          <span className="h-4 w-16 rounded-md bg-fd-muted" />
        </div>
        <div className="flex-1 bg-fd-card" />
      </div>
      <div className="flex flex-col">
        <div className="flex h-11 items-center border-b px-3">
          <span className="h-4 w-14 rounded-md bg-fd-muted" />
        </div>
        <div className="flex-1 bg-fd-card" />
      </div>
    </div>
  );
}

// Client-only: the parser builds Temporal values, which the server would have to serialize.
const PlaygroundIsland = dynamic(() => withTemporal(() => import("./playground")), {
  loading: PlaygroundSkeleton,
  ssr: false,
});

export default PlaygroundIsland;
