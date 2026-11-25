import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onSettled,
  untrack,
  type Accessor,
} from "solid-js";

import {
  createTimelineVirtualizer,
  type TimelineAxis,
  type TimelineVirtualizerInput,
} from "@registry/shared/resource-timeline-view/timeline-virtualizer";

export type { TimelineAxis };
export type TimelineVirtualizerOptions = TimelineVirtualizerInput;

/**
 * The timeline's virtualizer (`timeline-virtualizer.ts`) as Solid accessors: the rows and slots to
 * render, the canvas's size, and the resource column's and each slot's width. `viewport` is the
 * element that scrolls both axes.
 */
export function useTimelineVirtualizer(
  options: Accessor<TimelineVirtualizerOptions>,
  viewport: () => HTMLDivElement | undefined,
) {
  // Bumped whenever the virtualizer says what to render changed.
  const [version, setVersion] = createSignal(0, { ownedWrite: true });
  const timeline = createTimelineVirtualizer({
    ...untrack(options),
    getScrollElement: () => viewport() ?? null,
    onChange: () => setVersion((count) => count + 1),
  });
  const { rowAxis, timeAxis } = timeline;

  const layout = createMemo(() => {
    version();
    const next = options();
    return untrack(() => {
      timeline.update(next);
      return {
        ...timeline.columns(),
        height: rowAxis.getTotalSize(),
        rows: rowAxis.getVirtualItems(),
        slots: timeAxis.getVirtualItems(),
        width: timeAxis.getTotalSize(),
      };
    });
  });

  let unmount: (() => void) | undefined;
  // Whether the axes have the viewport, so they can scroll it.
  const [mounted, setMounted] = createSignal(false, { ownedWrite: true });
  // The axes pick up the viewport here, once: its width sets the resource column's and the
  // slots', which renders again.
  onSettled(() => {
    unmount = timeline.mount();
    timeline.afterRender();
    setMounted(true);
  });
  onCleanup(() => unmount?.());
  // After a render in a new direction, which puts the same time back in view.
  const direction = createMemo(() => options().direction);
  createEffect(direction, () => {
    if (untrack(mounted)) timeline.afterRender();
  });

  // One memo a field: a scroll that leaves the slots in view as they were, the same array, and
  // the sizes as they were re-renders none of the rows.
  return {
    columnWidth: createMemo(() => layout().columnWidth),
    height: createMemo(() => layout().height),
    mounted,
    rows: createMemo(() => layout().rows),
    rowAxis,
    slotWidth: createMemo(() => layout().slotWidth),
    slots: createMemo(() => layout().slots),
    timeAxis,
    width: createMemo(() => layout().width),
  };
}
