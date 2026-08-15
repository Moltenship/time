import type { Virtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useRef, type RefObject } from "react";

import { synchronizeAxes } from "./geometry";
import type { TimelineMetrics } from "./metrics";

interface ScrollSynchronizationOptions {
  readonly diagnosticsRef: RefObject<HTMLOutputElement | null>;
  readonly metrics: TimelineMetrics;
  readonly resourceAxisRef: RefObject<HTMLDivElement | null>;
  readonly rowVirtualizer: Virtualizer<HTMLDivElement, HTMLDivElement>;
  readonly timeAxisRef: RefObject<HTMLDivElement | null>;
  readonly timeVirtualizer: Virtualizer<HTMLDivElement, HTMLDivElement>;
  readonly viewportRef: RefObject<HTMLDivElement | null>;
}

export function useScrollSynchronization({
  diagnosticsRef,
  metrics,
  resourceAxisRef,
  rowVirtualizer,
  timeAxisRef,
  timeVirtualizer,
  viewportRef,
}: ScrollSynchronizationOptions) {
  const scheduledFrameRef = useRef<{
    readonly animationFrameId: number;
    readonly timeoutId: number;
  } | null>(null);

  const writeDiagnostics = useCallback(() => {
    const output = diagnosticsRef.current;
    if (output === null) {
      return;
    }

    const snapshot = metrics.snapshot();
    output.textContent = [
      `DOM rows ${snapshot.maxVisibleResources}/${snapshot.totalResources}`,
      `time ${snapshot.maxVisibleTimeSlots}/${snapshot.totalTimeSlots}`,
      `cells ≤ ${snapshot.maxProjectedCells}`,
      `axis writes ${snapshot.maxAxisWritesPerFrame}/frame`,
      `full scans ${snapshot.fullResourceFrameScans}`,
    ].join("  ·  ");
  }, [diagnosticsRef, metrics]);

  const handleScroll = useCallback(() => {
    if (scheduledFrameRef.current !== null) {
      return;
    }

    let animationFrameId = 0;
    let timeoutId = 0;
    const measureFrame = () => {
      if (scheduledFrameRef.current === null) {
        return;
      }
      cancelAnimationFrame(animationFrameId);
      clearTimeout(timeoutId);
      scheduledFrameRef.current = null;
      const startedAt = performance.now();
      const viewport = viewportRef.current;
      const timeAxis = timeAxisRef.current;
      const resourceAxis = resourceAxisRef.current;
      if (viewport === null || timeAxis === null || resourceAxis === null) {
        return;
      }

      const visibleResources = rowVirtualizer.getVirtualItems().length;
      const visibleTimeSlots = timeVirtualizer.getVirtualItems().length;
      const axisWrites = synchronizeAxes(
        { timeAxis, resourceAxis },
        { inline: viewport.scrollLeft, block: viewport.scrollTop },
      );
      metrics.recordFrame({
        visibleResources,
        visibleTimeSlots,
        projectedCells: visibleResources * visibleTimeSlots,
        axisWrites,
        durationMs: performance.now() - startedAt,
      });
      writeDiagnostics();
    };
    animationFrameId = requestAnimationFrame(measureFrame);
    timeoutId = window.setTimeout(measureFrame, 32);
    scheduledFrameRef.current = { animationFrameId, timeoutId };
  }, [
    metrics,
    resourceAxisRef,
    rowVirtualizer,
    timeAxisRef,
    timeVirtualizer,
    viewportRef,
    writeDiagnostics,
  ]);

  useEffect(
    () => () => {
      if (scheduledFrameRef.current !== null) {
        cancelAnimationFrame(scheduledFrameRef.current.animationFrameId);
        clearTimeout(scheduledFrameRef.current.timeoutId);
        scheduledFrameRef.current = null;
      }
    },
    [],
  );

  return handleScroll;
}
