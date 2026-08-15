// @vitest-environment jsdom

import { StrictMode, act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, expect, test, vi } from "vite-plus/test";

import { ResourceTimeline } from "../src/ResourceTimeline";
import "./setup";

let root: Root | undefined;

afterEach(async () => {
  if (root !== undefined) {
    await act(async () => root?.unmount());
    root = undefined;
  }
  vi.restoreAllMocks();
});

test("initial server geometry hydrates without recovery and exposes bounded diagnostics", async () => {
  const serverMarkup = renderToString(<ResourceTimeline />);
  const container = document.createElement("div");
  container.innerHTML = serverMarkup;
  document.body.append(container);
  const markupBeforeHydration = container.innerHTML;
  const recoverableErrors: unknown[] = [];
  const consoleErrors = vi.spyOn(console, "error").mockImplementation(() => undefined);

  await act(async () => {
    root = hydrateRoot(
      container,
      <StrictMode>
        <ResourceTimeline />
      </StrictMode>,
      {
        onRecoverableError(error) {
          recoverableErrors.push(error);
        },
      },
    );
  });

  expect(container.innerHTML).toBe(markupBeforeHydration);
  expect(recoverableErrors).toEqual([]);
  expect(consoleErrors).not.toHaveBeenCalled();
  const evidence = window.__resourceTimelineSpike?.readEvidence();
  expect(evidence?.renderedResourceRows).toBeGreaterThan(0);
  expect(evidence?.renderedResourceRows).toBeLessThan(40);
  expect(evidence?.renderedTimeHeaders).toBeLessThan(24);
  expect(evidence?.axesOutsideVirtualCanvas).toBe(true);
  expect(evidence?.maxDevicePixelError).toBe(0);
});

test("RTL and focus identity survive virtualization away from and back to the row", async () => {
  const container = document.createElement("div");
  container.innerHTML = renderToString(<ResourceTimeline />);
  document.body.append(container);

  await act(async () => {
    root = hydrateRoot(container, <ResourceTimeline />);
  });

  await act(async () => {
    await window.__resourceTimelineSpike?.setDirection("rtl");
  });
  let evidence = window.__resourceTimelineSpike?.readEvidence();
  expect(evidence?.direction).toBe("rtl");
  const viewport = container.querySelector<HTMLElement>(".timeline-viewport");
  expect(viewport).not.toBeNull();
  if (viewport !== null) {
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 520 },
      scrollHeight: { configurable: true, value: 19_250 },
    });
  }

  await act(async () => {
    await window.__resourceTimelineSpike?.focusResource(239);
  });
  evidence = window.__resourceTimelineSpike?.readEvidence();
  expect(viewport?.scrollTop).toBeGreaterThan(8_000);
  expect(
    [...container.querySelectorAll<HTMLElement>("[data-resource-id]")].map(
      (element) => element.dataset.resourceId,
    ),
  ).toContain("resource-240");
  expect(evidence?.focusedResourceId).toBe("resource-240");

  await act(async () => {
    if (viewport !== null) {
      viewport.scrollTop = 16_000;
      viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
  expect(document.activeElement).toBe(document.body);

  await act(async () => {
    if (viewport !== null) {
      viewport.scrollTop = 8_980;
      viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
  evidence = window.__resourceTimelineSpike?.readEvidence();
  expect(evidence?.focusedResourceId).toBe("resource-240");
});

test("nonzero direction changes preserve the logical time range and align both surfaces", async () => {
  const container = document.createElement("div");
  container.innerHTML = renderToString(<ResourceTimeline />);
  document.body.append(container);

  await act(async () => {
    root = hydrateRoot(container, <ResourceTimeline />);
  });
  const api = window.__resourceTimelineSpike;
  expect(api).toBeDefined();

  await act(async () => {
    await api?.runScrollProbe({ inline: 12_000, steps: 2, top: 0 });
  });
  const viewport = container.querySelector<HTMLElement>(".timeline-viewport");
  const timeAxis = container.querySelector<HTMLElement>(".time-axis");
  const ltrHeaders = [...container.querySelectorAll<HTMLElement>("[data-slot-header]")].map(
    (element) => element.dataset.slotHeader,
  );
  expect(viewport?.scrollLeft).toBe(12_000);
  expect(ltrHeaders.length).toBeGreaterThan(0);

  await act(async () => {
    await api?.setDirection("rtl");
  });
  const rtlHeaders = [...container.querySelectorAll<HTMLElement>("[data-slot-header]")].map(
    (element) => element.dataset.slotHeader,
  );
  expect(window.__resourceTimelineSpike?.readEvidence().direction).toBe("rtl");
  expect(viewport?.scrollLeft).toBe(-12_000);
  expect(timeAxis?.scrollLeft).toBe(-12_000);
  expect(rtlHeaders).toEqual(ltrHeaders);

  await act(async () => {
    await api?.setDirection("ltr");
  });
  const restoredHeaders = [...container.querySelectorAll<HTMLElement>("[data-slot-header]")].map(
    (element) => element.dataset.slotHeader,
  );
  expect(window.__resourceTimelineSpike?.readEvidence().direction).toBe("ltr");
  expect(viewport?.scrollLeft).toBe(12_000);
  expect(timeAxis?.scrollLeft).toBe(12_000);
  expect(restoredHeaders).toEqual(ltrHeaders);
});

test("browser evidence rejects a rendered fractional physical-pixel boundary", async () => {
  const container = document.createElement("div");
  container.innerHTML = renderToString(<ResourceTimeline placementScale={2} />);
  document.body.append(container);

  await act(async () => {
    root = hydrateRoot(container, <ResourceTimeline placementScale={2} />);
  });

  const header = container.querySelector<HTMLElement>("[data-slot-header]");
  expect(header).not.toBeNull();
  if (header === null) {
    return;
  }

  const devicePixelRatioDescriptor = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
  Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 1 });
  vi.spyOn(header, "getBoundingClientRect").mockReturnValue(new DOMRect(90.5, 0, 96, 48));

  try {
    const evidence = window.__resourceTimelineSpike?.readEvidence();
    expect(evidence).toMatchObject({
      browserDevicePixelRatio: 1,
      devicePixelPlacementAligned: false,
      maxDevicePixelError: 0.5,
      placementScale: 2,
    });
    expect(() => window.__resourceTimelineSpike?.assertDevicePixelPlacement()).toThrow(
      "Rendered timeline boundaries miss the 1x device grid",
    );
  } finally {
    if (devicePixelRatioDescriptor === undefined) {
      Reflect.deleteProperty(window, "devicePixelRatio");
    } else {
      Object.defineProperty(window, "devicePixelRatio", devicePixelRatioDescriptor);
    }
  }
});
