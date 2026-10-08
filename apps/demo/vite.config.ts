import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    tsconfigPaths: true,
  },
  lint: { options: { typeAware: true, typeCheck: true } },
  fmt: {},
  test: {
    // Vitest v4 compatibility: preserve mock call history.
    // Remove after tests no longer rely on calls from setup or earlier tests.
    // https://viteplus.dev/guide/vitest-v5#remove-unneeded-compatibility-settings
    // https://vitest.dev/guide/migration/#clearmocks-is-enabled-by-default
    clearMocks: false,
    fakeTimers: {
      // Vitest v4 compatibility: exclude the global Temporal polyfill from fake timers.
      // Remove only the Temporal entry when it should follow mocked time.
      // https://viteplus.dev/guide/vitest-v5#remove-unneeded-compatibility-settings
      // https://vitest.dev/guide/migration/#fake-timers-and-setsystemtime-now-mock-temporal
      toNotFake: ["Temporal"],
    },
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
