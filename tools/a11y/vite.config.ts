import { release } from "node:os";

import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";

/**
 * Playwright's Firefox can't find a profile folder on macOS 27 and quits before it opens a page
 * (#182). There, `--mode browsers` runs WebKit alone.
 */
const firefoxStarts = !(process.platform === "darwin" && Number(release().split(".")[0]) >= 27);

/** Reduced motion runs in a Chromium context of its own. */
const chromiumOnly = ["tests/reduced-motion.a11y.tsx"];

export default defineConfig(({ mode }) => {
  // `vp run browsers`: the suite in Firefox and WebKit instead of Chromium.
  const otherBrowsers = mode === "browsers";
  if (otherBrowsers && !firefoxStarts) {
    console.warn("Firefox left out: Playwright's Firefox doesn't start on macOS 27 (#182).");
  }

  return {
    // Each mode optimizes dependencies in a cache of its own, so two runs at once don't rewrite
    // each other's. Vitest's mode is `test`.
    cacheDir: mode === "test" ? undefined : `node_modules/.vite-${mode}`,
    plugins: [tailwindcss()],
    resolve: {
      tsconfigPaths: true,
    },
    lint: { options: { typeAware: true, typeCheck: true } },
    fmt: {},
    test: {
      // Not `*.test.tsx`, so the root `vp test` run, which has no browser, leaves these alone.
      include: ["tests/**/*.a11y.tsx"],
      setupFiles: ["./tests/setup.ts"],
      browser: {
        enabled: true,
        headless: true,
        instances: otherBrowsers
          ? [
              ...(firefoxStarts ? [{ browser: "firefox" as const, exclude: chromiumOnly }] : []),
              { browser: "webkit" as const, exclude: chromiumOnly },
            ]
          : [
              { browser: "chromium", exclude: chromiumOnly },
              {
                browser: "chromium",
                include: chromiumOnly,
                name: "reduced-motion",
                provider: playwright({ contextOptions: { reducedMotion: "reduce" } }),
              },
            ],
        provider: playwright(),
        viewport: { height: 800, width: 1280 },
      },
    },
  };
});
