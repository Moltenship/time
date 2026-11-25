import { ActivityIcon, CodeXmlIcon, MoonIcon, MusicIcon, TargetIcon } from "lucide-react";

import type { TimeGridAnnotationSource } from "@registry/time-grid-view/time-grid-annotations";

import { demoAnnotationSourceData, type DemoAnnotationSourceId } from "./annotations";

const icons = {
  coding: CodeXmlIcon,
  focus: TargetIcon,
  music: MusicIcon,
  sleep: MoonIcon,
  workouts: ActivityIcon,
} satisfies Record<DemoAnnotationSourceId, TimeGridAnnotationSource["Icon"]>;

/** The demo's annotation sources with their Lucide icons, as the views and the sidebar show them. */
export const demoAnnotationSources = demoAnnotationSourceData.map((source) => ({
  ...source,
  Icon: icons[source.id],
})) satisfies readonly TimeGridAnnotationSource[];
