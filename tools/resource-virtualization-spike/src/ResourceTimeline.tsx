import { useVirtualizer, type Rect, type Virtualizer } from "@tanstack/react-virtual";
import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import { useResourceTimelineBrowserApi, type TimelineDirection } from "./browserApi";
import { snapPlacement, snapToDevicePixel } from "./geometry";
import { createTimelineMetrics } from "./metrics";
import {
  INITIAL_VIEWPORT_RECT,
  LAB_RESOURCES,
  LAB_TIME_SLOTS,
  RESOURCE_AXIS_WIDTH,
  ROW_HEIGHT,
  TIME_AXIS_HEIGHT,
  TIME_SLOT_WIDTH,
  type LabResource,
  type TimeSlot,
} from "./model";
import { useResourceFocus } from "./useResourceFocus";
import { useScrollSynchronization } from "./useScrollSynchronization";
import { useTimelineDirection } from "./useTimelineDirection";

export type { BrowserEvidence, ResourceTimelineBrowserApi, TimelineDirection } from "./browserApi";

export interface ResourceTimelineProps {
  readonly resources?: readonly LabResource[];
  readonly timeSlots?: readonly TimeSlot[];
  readonly initialDirection?: TimelineDirection;
  readonly placementScale?: number;
}

const estimateResourceSize = () => ROW_HEIGHT;
const estimateTimeSlotSize = () => TIME_SLOT_WIDTH;
const measureResourceElement = () => ROW_HEIGHT;
const measureTimeSlotElement = () => TIME_SLOT_WIDTH;

function observeTimelineRect(
  instance: Virtualizer<HTMLDivElement, HTMLDivElement>,
  callback: (rect: Rect) => void,
) {
  const element = instance.scrollElement;
  const targetWindow = instance.targetWindow;
  if (element === null || targetWindow === null) {
    return;
  }

  const publishRect = (width: number, height: number) => {
    callback({
      width: width > 0 ? width : INITIAL_VIEWPORT_RECT.width,
      height: height > 0 ? height : INITIAL_VIEWPORT_RECT.height,
    });
  };
  publishRect(element.offsetWidth, element.offsetHeight);

  const observer = new targetWindow.ResizeObserver((entries) => {
    const entry = entries[0];
    const borderBox = entry?.borderBoxSize[0];
    if (borderBox !== undefined) {
      publishRect(borderBox.inlineSize, borderBox.blockSize);
      return;
    }
    publishRect(element.offsetWidth, element.offsetHeight);
  });
  observer.observe(element, { box: "border-box" });

  return () => observer.unobserve(element);
}

function absolutePlacement(
  start: number,
  size: number,
  placementScale: number,
  axis: "block" | "inline",
): CSSProperties {
  const snapped = snapPlacement(start, size, placementScale);
  return axis === "block"
    ? { top: snapped.start, height: snapped.size }
    : { insetInlineStart: snapped.start, width: snapped.size };
}

export function ResourceTimeline({
  resources = LAB_RESOURCES,
  timeSlots = LAB_TIME_SLOTS,
  initialDirection = "ltr",
  placementScale = 2,
}: ResourceTimelineProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const timeAxisRef = useRef<HTMLDivElement>(null);
  const resourceAxisRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const virtualCanvasRef = useRef<HTMLDivElement>(null);
  const diagnosticsRef = useRef<HTMLOutputElement>(null);
  const [direction, setDirectionState] = useState<TimelineDirection>(initialDirection);
  const [metrics] = useState(() => createTimelineMetrics(resources.length, timeSlots.length));
  const getScrollElement = useCallback(() => viewportRef.current, []);

  const getResourceKey = useCallback(
    (index: number) => {
      metrics.recordResourceKeyRead();
      return resources[index]?.id ?? `missing-resource-${index}`;
    },
    [metrics, resources],
  );
  const getTimeSlotKey = useCallback(
    (index: number) => timeSlots[index]?.id ?? `missing-slot-${index}`,
    [timeSlots],
  );

  const readResource = useCallback(
    (index: number) => {
      metrics.recordResourceRead();
      return resources[index];
    },
    [metrics, resources],
  );
  const readTimeSlot = useCallback((index: number) => timeSlots[index], [timeSlots]);

  const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: resources.length,
    estimateSize: estimateResourceSize,
    getItemKey: getResourceKey,
    getScrollElement,
    initialOffset: 0,
    initialRect: INITIAL_VIEWPORT_RECT,
    measureElement: measureResourceElement,
    observeElementRect: observeTimelineRect,
    overscan: 5,
    useFlushSync: false,
  });
  const timeVirtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: timeSlots.length,
    estimateSize: estimateTimeSlotSize,
    getItemKey: getTimeSlotKey,
    getScrollElement,
    horizontal: true,
    initialOffset: 0,
    initialRect: INITIAL_VIEWPORT_RECT,
    isRtl: direction === "rtl",
    measureElement: measureTimeSlotElement,
    observeElementRect: observeTimelineRect,
    overscan: 3,
    useFlushSync: false,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const virtualTimeSlots = timeVirtualizer.getVirtualItems();
  const projectedCellCount = virtualRows.length * virtualTimeSlots.length;
  const canvasHeight = snapToDevicePixel(rowVirtualizer.getTotalSize(), placementScale);
  const canvasWidth = snapToDevicePixel(timeVirtualizer.getTotalSize(), placementScale);

  useLayoutEffect(() => {
    metrics.recordCommit(virtualRows.length, virtualTimeSlots.length, projectedCellCount);
  }, [metrics, projectedCellCount, virtualRows.length, virtualTimeSlots.length]);

  const {
    activeResourceId,
    focusResource,
    handleResourceBlur,
    handleResourceFocus,
    handleResourceKeyDown,
  } = useResourceFocus({
    resourceAxisRef,
    resources,
    rowVirtualizer,
    viewportRef,
    virtualRows,
  });
  const handleScroll = useScrollSynchronization({
    diagnosticsRef,
    metrics,
    resourceAxisRef,
    rowVirtualizer,
    timeAxisRef,
    timeVirtualizer,
    viewportRef,
  });
  const changeDirection = useTimelineDirection({
    direction,
    resourceAxisRef,
    setDirection: setDirectionState,
    timeAxisRef,
    viewportRef,
  });
  useResourceTimelineBrowserApi({
    direction,
    focusResource,
    metrics,
    placementScale,
    resourceAxisRef,
    setDirection: changeDirection,
    shellRef,
    timeAxisRef,
    viewportRef,
    virtualCanvasRef,
  });

  const shellStyle = {
    "--resource-axis-width": `${RESOURCE_AXIS_WIDTH}px`,
    "--time-axis-height": `${TIME_AXIS_HEIGHT}px`,
    "--viewport-height": `${INITIAL_VIEWPORT_RECT.height}px`,
    "--viewport-width": `${INITIAL_VIEWPORT_RECT.width}px`,
  } as CSSProperties;

  return (
    <section className="timeline-lab" aria-labelledby="timeline-title">
      <div className="lab-heading">
        <div>
          <p className="eyebrow">LIVE RANGE / 14 DAYS</p>
          <h1 id="timeline-title">Resource field map</h1>
        </div>
        <div className="lab-controls" aria-label="Timeline controls">
          <button
            className={direction === "ltr" ? "is-active" : undefined}
            onClick={() => changeDirection("ltr")}
            type="button"
          >
            LTR
          </button>
          <button
            className={direction === "rtl" ? "is-active" : undefined}
            onClick={() => changeDirection("rtl")}
            type="button"
          >
            RTL
          </button>
          <button onClick={() => focusResource(239)} type="button">
            Focus bay 240
          </button>
        </div>
      </div>

      <div className="timeline-shell" dir={direction} ref={shellRef} style={shellStyle}>
        <div className="timeline-corner" data-sticky-axis="corner">
          <span>RESOURCE</span>
          <b>500 BAYS</b>
        </div>

        <div aria-hidden="true" className="time-axis" data-sticky-axis="time" ref={timeAxisRef}>
          <div className="time-axis-canvas" style={{ width: canvasWidth }}>
            {virtualTimeSlots.map((virtualSlot) => {
              const slot = readTimeSlot(virtualSlot.index);
              if (slot === undefined) {
                return null;
              }
              const placement = snapPlacement(virtualSlot.start, virtualSlot.size, placementScale);
              return (
                <div
                  className={slot.hour === 0 ? "time-header is-day-start" : "time-header"}
                  data-slot-header={slot.id}
                  data-snapped-start={placement.start}
                  key={virtualSlot.key}
                  style={absolutePlacement(
                    virtualSlot.start,
                    virtualSlot.size,
                    placementScale,
                    "inline",
                  )}
                >
                  <span>{slot.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div
          aria-label="Resources"
          className="resource-axis"
          data-sticky-axis="resource"
          ref={resourceAxisRef}
          role="rowgroup"
        >
          <div className="resource-axis-canvas" style={{ height: canvasHeight }}>
            {virtualRows.map((virtualRow) => {
              const resource = readResource(virtualRow.index);
              if (resource === undefined) {
                return null;
              }
              const placement = snapPlacement(virtualRow.start, virtualRow.size, placementScale);
              return (
                <button
                  aria-label={`${resource.title}, zone ${resource.zone}`}
                  aria-rowindex={virtualRow.index + 1}
                  className="resource-label"
                  data-resource-id={resource.id}
                  data-resource-label={resource.id}
                  data-snapped-start={placement.start}
                  key={virtualRow.key}
                  onBlur={handleResourceBlur}
                  onFocus={() => handleResourceFocus(resource.id)}
                  onKeyDown={(event) => handleResourceKeyDown(event, virtualRow.index)}
                  role="rowheader"
                  style={absolutePlacement(
                    virtualRow.start,
                    virtualRow.size,
                    placementScale,
                    "block",
                  )}
                  tabIndex={activeResourceId === resource.id ? 0 : -1}
                  type="button"
                >
                  <span>{resource.title}</span>
                  <small>{resource.zone}</small>
                </button>
              );
            })}
          </div>
        </div>

        <div
          aria-colcount={timeSlots.length}
          aria-label="Resource timeline"
          aria-rowcount={resources.length}
          className="timeline-viewport"
          data-direction={direction}
          onScroll={handleScroll}
          ref={viewportRef}
          role="grid"
          tabIndex={-1}
        >
          <div
            className="timeline-canvas"
            data-virtual-canvas="true"
            ref={virtualCanvasRef}
            style={{ height: canvasHeight, width: canvasWidth }}
          >
            {virtualRows.map((virtualRow) => {
              const resource = readResource(virtualRow.index);
              if (resource === undefined) {
                return null;
              }
              const rowPlacement = snapPlacement(virtualRow.start, virtualRow.size, placementScale);
              return (
                <div
                  aria-rowindex={virtualRow.index + 1}
                  className="timeline-row"
                  data-resource-row={resource.id}
                  data-snapped-start={rowPlacement.start}
                  key={virtualRow.key}
                  role="row"
                  style={{
                    ...absolutePlacement(
                      virtualRow.start,
                      virtualRow.size,
                      placementScale,
                      "block",
                    ),
                    width: canvasWidth,
                  }}
                >
                  {virtualTimeSlots.map((virtualSlot) => {
                    const slot = readTimeSlot(virtualSlot.index);
                    if (slot === undefined) {
                      return null;
                    }
                    const slotPlacement = snapPlacement(
                      virtualSlot.start,
                      virtualSlot.size,
                      placementScale,
                    );
                    const hasBooking = (virtualRow.index * 13 + virtualSlot.index * 7) % 97 === 0;
                    return (
                      <div
                        aria-colindex={virtualSlot.index + 1}
                        className={hasBooking ? "timeline-cell has-booking" : "timeline-cell"}
                        data-slot-cell={slot.id}
                        data-snapped-start={slotPlacement.start}
                        key={`${resource.id}:${slot.id}`}
                        role="gridcell"
                        style={absolutePlacement(
                          virtualSlot.start,
                          virtualSlot.size,
                          placementScale,
                          "inline",
                        )}
                      >
                        {hasBooking ? (
                          <span aria-label={`${resource.title} reserved`}>●</span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <output className="diagnostics" ref={diagnosticsRef}>
        DOM rows 0/{resources.length} · time 0/{timeSlots.length} · cells ≤ 0 · axis writes 0/frame
        · full scans 0
      </output>
    </section>
  );
}
