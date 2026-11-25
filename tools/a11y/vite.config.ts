import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";

import solid from "@solidjs/vite-plugin";
import stylex from "@stylexjs/unplugin";
import tailwindcss from "@tailwindcss/vite";
import { configDefaults, defineConfig } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";

import { solidRegistrySource } from "../registry/src/solid-source";
import { animationRate } from "./animation-rate";
import { mouse } from "./mouse";
import { solidDemo } from "./solid-demo";
import { Watchdog } from "./watchdog";

/**
 * `--mode browsers` leaves Firefox out until #263 brings it back: a drag test failed there in the
 * 1.0.0-rc.2 release gate. Playwright's Firefox also can't start on macOS 27 (#182).
 */
const firefoxRuns = false;

const fromHere = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/** Reduced motion runs in a Chromium context of its own. */
const chromiumOnly = ["tests/reduced-motion.a11y.tsx"];

/**
 * The demo's StyleX page runs without Tailwind's global CSS, as it does in the demo: the two define
 * the same tokens, and a contrast check should see the page's own. It runs after the others, in a
 * group of its own, so its second browser doesn't compete with theirs for the CPU.
 */
const stylexOnly = ["tests/demo-stylex*.a11y.tsx"];
/**
 * The Solid registry's files run in a project of their own (ADR 0279): its own Vite server, which
 * compiles JSX with Solid's compiler and resolves the shared files' facade to the Solid one. In
 * React's server the same shared files resolve to React's.
 */
const solidFiles = ["tests/solid/**/*.a11y.tsx"];
const tailwindExclude = [...chromiumOnly, ...stylexOnly, ...solidFiles];
/**
 * The flavours' parity slows animations through Chromium's DevTools protocol, so Chromium alone,
 * and the demo's parity and framework switch with it: they compare two pages in one engine, or
 * carry one page's address and storage to the other, which one engine shows.
 */
const otherBrowsersExclude = [
  ...tailwindExclude,
  "tests/parity.a11y.tsx",
  "tests/demo-parity.a11y.tsx",
  "tests/demo-switch.a11y.tsx",
];
// Absolute: Vitest doesn't resolve the paths of an instance's own setup files.
const stylexSetup = [fromHere("./tests/setup.ts")];
const tailwindSetup = [...stylexSetup, fromHere("./tests/setup-tailwind.ts")];

export default defineConfig(({ mode }) => {
  // `vp run browsers`: the suite in Firefox and WebKit instead of Chromium.
  const otherBrowsers = mode === "browsers";
  if (otherBrowsers && !firefoxRuns) console.warn("Firefox left out until #263.");

  /**
   * Test files that run at once, each in a page of its own. Vitest gives each browser a pool of
   * up to 12 pages, which oversubscribed the machine: a browser run shares it with the gate's build
   * and unit-test lane. So a run takes half the cores, split between its browsers, and the full
   * gate runs its browser runs one at a time. Reduced motion has one file, so one page.
   */
  const browsers = otherBrowsers && firefoxRuns ? 2 : 1;
  const maxWorkers = Math.max(1, Math.ceil(availableParallelism() / 2 / browsers));

  // A GitHub runner is the speed `--mode ci-speed` simulates. Unthrottled there, it would be `a11y`
  // again, test for test, which the release gate has just run on that runner: it runs nothing.
  if (mode === "ci-speed" && process.env.GITHUB_ACTIONS === "true") {
    console.warn("a11y:ci-speed: left out on a GitHub runner, where it would repeat `a11y`.");
    return { test: { include: [], passWithNoTests: true } };
  }

  // Each mode optimizes dependencies in a cache of its own, so two runs at once don't rewrite each
  // other's, and so does each project, whose servers prebundle different packages. Vitest's mode
  // is `test`.
  const cacheDir = (project: "react" | "solid") =>
    project === "solid"
      ? `node_modules/.vite-${mode}-solid`
      : mode === "test"
        ? undefined
        : `node_modules/.vite-${mode}`;
  const browser = {
    enabled: true,
    headless: true,
    provider: playwright(),
    viewport: { height: 800, width: 1280 },
    // Real mouse input at page points, step by step, for drags a test watches as they go, and
    // slowed animations for a test that samples them as they run.
    commands: { animationRate, mouse },
  };

  return {
    lint: { options: { typeAware: true, typeCheck: true } },
    fmt: {},
    test: {
      maxWorkers,
      // A stuck page can't time its own tests out: the watchdog fails the run from Node instead.
      // Beside Vitest's own reporters, which in CI include the GitHub Actions annotations.
      reporters: [
        ...configDefaults.reporters,
        new Watchdog({ limitMs: 600_000, stallMs: 120_000 }),
      ],
      projects: [
        {
          cacheDir: cacheDir("react"),
          // What StyleX's compiled files import, known up front so the first such test doesn't reload.
          optimizeDeps: { include: ["@stylexjs/stylex/lib/stylex-inject"] },
          plugins: [
            stylex.vite({
              aliases: { "@registry/*": [fromHere("../../registry/*")] },
              dev: true,
              runtimeInjection: true,
              unstable_moduleResolution: { rootDir: fromHere("../.."), type: "commonJS" },
            }),
            tailwindcss(),
            // The Solid demo, which the demo's parity test compares with the React demo.
            solidDemo(),
          ],
          resolve: {
            tsconfigPaths: true,
          },
          test: {
            name: "react",
            // Not `*.test.tsx`, so the root `vp test` run, which has no browser, leaves these alone.
            include: ["tests/**/*.a11y.tsx"],
            browser: {
              ...browser,
              instances: otherBrowsers
                ? [
                    ...(firefoxRuns
                      ? [
                          {
                            browser: "firefox" as const,
                            exclude: otherBrowsersExclude,
                            setupFiles: tailwindSetup,
                          },
                        ]
                      : []),
                    {
                      browser: "webkit" as const,
                      exclude: otherBrowsersExclude,
                      setupFiles: tailwindSetup,
                    },
                    {
                      browser: "webkit" as const,
                      include: stylexOnly,
                      name: "webkit-stylex",
                      sequence: { groupOrder: 1 },
                      setupFiles: stylexSetup,
                    },
                  ]
                : [
                    { browser: "chromium", exclude: tailwindExclude, setupFiles: tailwindSetup },
                    {
                      browser: "chromium",
                      include: chromiumOnly,
                      name: "reduced-motion",
                      provider: playwright({ contextOptions: { reducedMotion: "reduce" } }),
                      setupFiles: tailwindSetup,
                    },
                    {
                      browser: "chromium",
                      include: stylexOnly,
                      name: "chromium-stylex",
                      sequence: { groupOrder: 1 },
                      setupFiles: stylexSetup,
                    },
                  ],
            },
          },
        },
        {
          cacheDir: cacheDir("solid"),
          // @ui-sdk/solid ships JSX for the app's Solid to compile, which the plugin finds only
          // among this package's own dependencies; it comes here through calendar-solid. Its core
          // stays out too, so there's one copy of ui-sdk's kernel, as in the Solid demo.
          optimizeDeps: { exclude: ["@ui-sdk/core", "@ui-sdk/solid"] },
          plugins: [solid(), solidRegistrySource(), tailwindcss()],
          resolve: {
            // The Solid demo's shared modules from the React demo (`@demo/*`) name the calendar's
            // facade, which is the Solid one here, as in the Solid demo's own config.
            alias: [
              {
                find: /^@moltenship\/calendar$/u,
                replacement: fromHere("../../packages/calendar-solid/src/index.ts"),
              },
            ],
            tsconfigPaths: true,
          },
          test: {
            name: "solid",
            include: solidFiles,
            browser: {
              ...browser,
              instances: [
                {
                  browser: otherBrowsers ? ("webkit" as const) : ("chromium" as const),
                  name: otherBrowsers ? "solid-webkit" : "solid-chromium",
                  setupFiles: tailwindSetup,
                },
              ],
            },
          },
        },
      ],
    },
  };
});
