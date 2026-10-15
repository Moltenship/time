import { defineConfig } from "vite-plus";

const script = (file: string) => `node --import tsx src/${file}`;

export default defineConfig({
  lint: { options: { typeAware: true, typeCheck: true } },
  fmt: {},
  run: {
    tasks: {
      size: script("size.ts"),
      api: script("api.ts"),
      "api:update": { command: script("api.ts --update"), cache: false },
      exports: { command: script("exports.ts"), cache: false },
      treeshake: script("treeshake.ts"),
      consumer: { command: script("consumer.ts"), cache: false },
      "dry-run": { command: script("dry-run.ts"), cache: false },
      artifacts: { command: script("artifacts.ts"), cache: false },
      // The whole release, from this laptop (docs/internal/releasing.md). Uncached: a cached task
      // doesn't pass GH_REPO through to gh, and every run must reach npm and GitHub.
      release: { command: script("release.ts"), cache: false },
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
