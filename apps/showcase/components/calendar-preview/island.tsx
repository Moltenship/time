"use client";

import dynamic from "next/dynamic";

/** Static stand-in that fills the frame while Temporal and the calendar load in the browser. */
function PreviewSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading calendar" className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <span className="h-8 w-20 rounded-full bg-fd-muted" />
        <span className="h-5 w-40 rounded-md bg-fd-muted" />
      </div>
      <div className="flex-1 bg-[linear-gradient(to_bottom,var(--color-fd-border)_1px,transparent_1px)] bg-size-[100%_3rem]" />
    </div>
  );
}

// Client-only: today, the time zone and the seeded week all come from the visitor's clock.
const PreviewIsland = dynamic(
  async () => {
    // Chrome and Firefox ship Temporal natively; only load the polyfill where it is missing.
    if (!("Temporal" in globalThis)) await import("temporal-polyfill/global");
    // Imported after the polyfill so no calendar module evaluates without Temporal.
    return import("./calendar");
  },
  { loading: PreviewSkeleton, ssr: false },
);

export default PreviewIsland;
