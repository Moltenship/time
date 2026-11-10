import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      test: "vp test",
      // Never cached: it rewrites apps/showcase/public/r, which it also reads, and it is fast.
      site: { command: "node --import tsx src/build-cli.ts", cache: false },
      e2e: { command: "node --import tsx src/e2e.ts", cache: false },
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
