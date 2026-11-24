"use client";

import dynamic from "next/dynamic";

import { PreviewSkeleton, withTemporal } from "../calendar-preview/island";

// Client-only, as the other previews: the bridge reads the page, and Temporal loads where it is
// missing.
export const AgentOverviewIsland = dynamic(() => withTemporal(() => import("./overview")), {
  loading: PreviewSkeleton,
  ssr: false,
});

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
