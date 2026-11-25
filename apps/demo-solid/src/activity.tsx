import type { TimeGridAnnotationSource } from "@registry/time-grid-view/time-grid-annotations";

import { demoAnnotationSourceData, type DemoAnnotationSourceId } from "@demo/annotations";

import { ActivityIcon, CodeXmlIcon, MoonIcon, MusicIcon, TargetIcon } from "./icons";

const icons = {
  coding: CodeXmlIcon,
  focus: TargetIcon,
  music: MusicIcon,
  sleep: MoonIcon,
  workouts: ActivityIcon,
} satisfies Record<DemoAnnotationSourceId, TimeGridAnnotationSource["Icon"]>;

/** The React demo's annotation sources (apps/demo/src/annotations.ts) with the same icons. */
export const activitySources = demoAnnotationSourceData.map((source) => ({
  ...source,
  Icon: icons[source.id],
})) satisfies readonly TimeGridAnnotationSource[];
