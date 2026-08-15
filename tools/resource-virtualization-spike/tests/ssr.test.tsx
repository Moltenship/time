// @vitest-environment node

import { renderToString } from "react-dom/server";
import { expect, test } from "vite-plus/test";

import { ResourceTimeline } from "../src/ResourceTimeline";

function count(markup: string, token: string) {
  return markup.split(token).length - 1;
}

test("deterministic initial geometry yields useful bounded server markup", () => {
  const first = renderToString(<ResourceTimeline />);
  const second = renderToString(<ResourceTimeline />);

  expect(first).toBe(second);
  expect(first).toContain('aria-rowcount="500"');
  expect(first).toContain('aria-colcount="336"');
  expect(first).toContain('data-sticky-axis="time"');
  expect(first).toContain('data-sticky-axis="resource"');
  expect(count(first, "data-resource-row=")).toBeGreaterThan(0);
  expect(count(first, "data-resource-row=")).toBeLessThan(40);
  expect(count(first, "data-slot-header=")).toBeGreaterThan(0);
  expect(count(first, "data-slot-header=")).toBeLessThan(24);
  expect(count(first, "data-resource-row=")).toBe(count(first, "data-resource-label="));
});

test("RTL server markup is deterministic and uses the same bounded geometry", () => {
  const first = renderToString(<ResourceTimeline initialDirection="rtl" />);
  const second = renderToString(<ResourceTimeline initialDirection="rtl" />);

  expect(first).toBe(second);
  expect(first).toContain('dir="rtl"');
  expect(count(first, "data-resource-row=")).toBeLessThan(40);
  expect(count(first, "data-slot-header=")).toBeLessThan(24);
});
