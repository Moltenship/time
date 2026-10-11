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

async function withTemporal<TModule>(load: () => Promise<TModule>): Promise<TModule> {
  // Chrome and Firefox ship Temporal natively; only load the polyfill where it is missing.
  if (!("Temporal" in globalThis)) await import("temporal-polyfill/global");
  // Imported after the polyfill so no calendar module evaluates without Temporal.
  return load();
}

// Client-only: today, the time zone and the seeded week all come from the visitor's clock.
const PreviewIsland = dynamic(() => withTemporal(() => import("./calendar")), {
  loading: PreviewSkeleton,
  ssr: false,
});

/** The resource columns view, with its own rooms and people. */
export const ResourcePreviewIsland = dynamic(() => withTemporal(() => import("./resources")), {
  loading: PreviewSkeleton,
  ssr: false,
});

/** Three busy days with a toggle between the overlap layouts. */
export const OverlapPreviewIsland = dynamic(() => withTemporal(() => import("./overlap")), {
  loading: PreviewSkeleton,
  ssr: false,
});

/** This week's office hours, shaded by a recipe a toggle picks. */
export const ShadingPreviewIsland = dynamic(() => withTemporal(() => import("./shading")), {
  loading: PreviewSkeleton,
  ssr: false,
});

export default PreviewIsland;
