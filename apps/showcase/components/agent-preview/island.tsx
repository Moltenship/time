"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import { PreviewSkeleton, withTemporal } from "../calendar-preview/island";

// Client-only, as the other previews: the bridge reads the page, and Temporal loads where it is
// missing.
export const AgentOverviewIsland = dynamic(() => withTemporal(() => import("./overview")), {
  loading: PreviewSkeleton,
  ssr: false,
});

/**
 * The overview example, loaded once it is within a screen or so of the viewport. The landing page
 * shows it far below the first screen, where its code would otherwise load with the page.
 */
export function AgentOverviewNearIsland() {
  const marker = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const element = marker.current;
    if (element === null) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin: "800px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  if (near) return <AgentOverviewIsland />;
  return (
    <div className="h-[48rem]" ref={marker}>
      <PreviewSkeleton />
    </div>
  );
}

export const AgentPermissionsIsland = dynamic(() => withTemporal(() => import("./permissions")), {
  loading: PreviewSkeleton,
  ssr: false,
});

export const AgentChangesIsland = dynamic(() => withTemporal(() => import("./changes")), {
  loading: PreviewSkeleton,
  ssr: false,
});

export const AgentSaveIsland = dynamic(() => withTemporal(() => import("./save")), {
  loading: PreviewSkeleton,
  ssr: false,
});

export const AgentDeleteIsland = dynamic(() => withTemporal(() => import("./delete")), {
  loading: PreviewSkeleton,
  ssr: false,
});

export const AgentWebMcpIsland = dynamic(() => withTemporal(() => import("./webmcp")), {
  loading: PreviewSkeleton,
  ssr: false,
});

export const AgentServerIsland = dynamic(() => withTemporal(() => import("./server")), {
  loading: PreviewSkeleton,
  ssr: false,
});
