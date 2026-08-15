import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vite-plus/test";

const utilitySourcePaths = [
  "packages/calendar-temporal/src/grids/calendar-grid.ts",
  "packages/calendar-temporal/src/instant/iteration.ts",
  "packages/calendar-temporal/src/instant/rounding.ts",
  "packages/calendar-temporal/src/intervals/half-open.ts",
  "packages/calendar-temporal/src/intervals/operations.ts",
  "packages/calendar-temporal/src/plain-date/iteration.ts",
  "packages/calendar-temporal/src/plain-time/rounding.ts",
] as const;

describe("calendar-temporal runtime boundary", () => {
  test("targets unflagged native Temporal on Node 26 or newer", () => {
    expect(Number(process.versions.node.split(".")[0])).toBeGreaterThanOrEqual(26);
    expect(globalThis.Temporal).toBeDefined();
  });

  test("keeps utility modules free of implicit time, timezone, legacy Date, and polyfills", async () => {
    const source = (
      await Promise.all(utilitySourcePaths.map((path) => readFile(path, "utf8")))
    ).join("\n");

    expect(source).not.toMatch(/\bTemporal\.Now\b/u);
    expect(source).not.toMatch(/\btimeZone\b/u);
    expect(source).not.toMatch(/\bDate\b/u);
    expect(source).not.toContain("@js-temporal/polyfill");
    expect(source).not.toMatch(/\bparse[A-Z\w]*\s*\(/u);
  });

  test("ships without production dependencies", async () => {
    const manifest = JSON.parse(
      await readFile("packages/calendar-temporal/package.json", "utf8"),
    ) as {
      readonly dependencies?: Record<string, string>;
    };

    expect(manifest.dependencies ?? {}).toEqual({});
  });
});
