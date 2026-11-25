// The Annotations page's own parts for the Solid week and day, after `shadcn add` of the time grid.

// #region composition
import { For, Show } from "solid-js";

import {
  AnnotationMark,
  AnnotationMarkIcon,
  AnnotationRail,
  type TimeGridAnnotationMarkData,
  type TimeGridAnnotationsProps,
} from "@/components/calendar/time-grid-view/time-grid-annotations";
import { createWeekView } from "@/components/calendar/time-grid-view/time-grid-view";

import type { Event } from "./week-page";

/** Your brand's mark, in place of the source's icon. */
function BrandLogo() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

function MyAnnotations(props: TimeGridAnnotationsProps) {
  return (
    <AnnotationRail>
      <For each={props.marks} keyed={(mark: TimeGridAnnotationMarkData) => mark.key}>
        {(mark) => (
          <AnnotationMark mark={mark()} class="data-[source=music]:bg-[#1DB954]">
            <Show when={mark().source.id === "music"} fallback={<AnnotationMarkIcon />}>
              <AnnotationMarkIcon>
                <BrandLogo />
              </AnnotationMarkIcon>
            </Show>
          </AnnotationMark>
        )}
      </For>
    </AnnotationRail>
  );
}

export const weekView = createWeekView<Event>({ annotations: { Annotations: MyAnnotations } });
// #endregion composition

// #region rail
// Thin bars that keep their true length.
export const barsView = createWeekView<Event>({
  annotations: { rail: { width: 10, markWidth: 4 } },
});
// #endregion rail
