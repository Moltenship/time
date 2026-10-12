import { glob, readFile } from "node:fs/promises";

import { describe, expect, test } from "vite-plus/test";

const timezoneFreeUtilitySourcePaths = [
  "packages/calendar-temporal/src/grids/calendar-grid.ts",
  "packages/calendar-temporal/src/instant/iteration.ts",
  "packages/calendar-temporal/src/instant/rounding.ts",
  "packages/calendar-temporal/src/intervals/half-open.ts",
  "packages/calendar-temporal/src/intervals/operations.ts",
  "packages/calendar-temporal/src/plain-date/iteration.ts",
  "packages/calendar-temporal/src/plain-time/rounding.ts",
] as const;

const zonedUtilitySourcePaths = [
  "packages/calendar-temporal/src/zoned/day.ts",
  "packages/calendar-temporal/src/zoned/machine-keys.ts",
  "packages/calendar-temporal/src/zoned/projection.ts",
  "packages/calendar-temporal/src/zoned/rounding.ts",
  "packages/calendar-temporal/src/zoned/slots.ts",
] as const;

describe("calendar-temporal runtime boundary", () => {
  test("targets unflagged native Temporal on Node 26 or newer", () => {
    expect(Number(process.versions.node.split(".")[0])).toBeGreaterThanOrEqual(26);
    expect(globalThis.Temporal).toBeDefined();
  });

  test("keeps utility modules free of implicit time, timezone, legacy Date, and polyfills", async () => {
    const timezoneFreeSource = (
      await Promise.all(timezoneFreeUtilitySourcePaths.map((path) => readFile(path, "utf8")))
    ).join("\n");
    const allUtilitySource = `${timezoneFreeSource}\n${(
      await Promise.all(zonedUtilitySourcePaths.map((path) => readFile(path, "utf8")))
    ).join("\n")}`;

    expect(timezoneFreeSource).not.toMatch(/\btimeZone\b/u);
    expect(allUtilitySource).not.toMatch(/\bTemporal\.Now\b/u);
    expect(allUtilitySource).not.toMatch(/\bDate\b/u);
    expect(allUtilitySource).not.toContain("@js-temporal/polyfill");
    expect(allUtilitySource).not.toMatch(/\bparse[A-Z\w]*\s*\(/u);
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

describe("the clock boundary", () => {
  test("only the system clock reads the time, and no package or view uses Date", async () => {
    const clock = "packages/calendar-temporal/src/clock/calendar-clock.ts";
    const offenders: string[] = [];
    const scanned: string[] = [];
    for await (const path of glob(["packages/*/src/**/*.{ts,tsx}", "registry/**/*.{ts,tsx}"])) {
      if (/(?:^|\/)(?:node_modules|tests)\/|\.test\.tsx?$/u.test(path)) continue;
      scanned.push(path);
      const source = await readFile(path, "utf8");
      if (path !== clock && /\bTemporal\.Now\b/u.test(source))
        offenders.push(`${path}: Temporal.Now`);
      if (/\bDate\s*\(|\bDate\.(?:now|parse|UTC)\b/u.test(source)) offenders.push(`${path}: Date`);
    }

    // It scanned something: the clock itself and the React root, which reads it.
    expect(scanned).toEqual(expect.arrayContaining([clock, "packages/calendar-react/src/root.ts"]));
    expect(offenders).toEqual([]);
  });
});
