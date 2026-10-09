import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";

export default defineConfig({
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
      instances: [
        { browser: "chromium", exclude: ["tests/reduced-motion.a11y.tsx"] },
        {
          browser: "chromium",
          include: ["tests/reduced-motion.a11y.tsx"],
          name: "reduced-motion",
          provider: playwright({ contextOptions: { reducedMotion: "reduce" } }),
        },
      ],
      provider: playwright(),
      viewport: { height: 800, width: 1280 },
    },
  },
});
