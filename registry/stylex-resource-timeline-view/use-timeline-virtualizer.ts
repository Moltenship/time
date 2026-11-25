import { useLayoutEffect, useReducer, useRef, useState } from "react";

import {
  createTimelineVirtualizer,
  type TimelineAxis,
  type TimelineVirtualizerInput,
} from "@registry/shared/resource-timeline-view/timeline-virtualizer";

export type { TimelineAxis };
export type TimelineVirtualizerOptions = TimelineVirtualizerInput;

/**
 * The timeline's virtualizer (`timeline-virtualizer.ts`) in a React component: resource rows and
 * time slots as two virtualizers over one scroll viewport, rendering only what's in view. It
 * never forces synchronous React updates, so server markup hydrates as is.
 */
export function useTimelineVirtualizer(options: TimelineVirtualizerOptions) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const rerender = useReducer((count: number) => count + 1, 0)[1];
  const [timeline] = useState(() =>
    createTimelineVirtualizer({
      ...options,
      getScrollElement: () => viewportRef.current,
      onChange: () => rerender(),
    }),
  );
  timeline.update(options);

  useLayoutEffect(() => timeline.mount(), [timeline]);
  useLayoutEffect(() => timeline.afterRender());

  const { columnWidth, slotWidth } = timeline.columns();
  return {
    columnWidth,
    rowAxis: timeline.rowAxis,
    slotWidth,
    timeAxis: timeline.timeAxis,
    viewportRef,
  };
}
