import { describe, expect, test } from "vite-plus/test";

import { deterministicEnvironment } from "../src/fixture";
import { runHydrationScenario } from "./hydration-harness";

describe("SSR fixture", () => {
  test("renders, hydrates, interacts, and unmounts with explicit deterministic inputs", async () => {
    const report = await runHydrationScenario({
      serverEnvironment: deterministicEnvironment,
      clientEnvironment: deterministicEnvironment,
      interact: true,
    });

    expect(report.recoverableErrors).toEqual([]);
    expect(report.hydratedWithoutMutation).toBe(true);
    expect(report.interactionCount).toBe(1);
    expect(report.unmounted).toBe(true);
    expect(report.environment).toMatchObject({
      locale: "en-GB",
      timeZone: "Asia/Tbilisi",
      weekStartsOn: 1,
      now: "2026-08-15T08:30:00Z",
    });
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
    expect(globalThis.IS_REACT_ACT_ENVIRONMENT).toBeUndefined();
  });

  test("known-bad server/client divergence fails for React's hydration reason", async () => {
    const report = await runHydrationScenario({
      serverEnvironment: deterministicEnvironment,
      clientEnvironment: { ...deterministicEnvironment, locale: "fr-FR" },
      interact: false,
    });

    expect(report.recoverableErrors.at(0)).toContain("Hydration failed");
    expect(report.hydratedWithoutMutation).toBe(false);
  });
});
