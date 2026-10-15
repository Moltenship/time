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
      // The release (docs/internal/releasing.md): `release` starts and watches the release
      // workflow, `ci` is that workflow's steps, `trust` the owner's one-time npm setup. Uncached:
      // a cached task doesn't pass GH_REPO or GitHub's OIDC variables through, and each must reach
      // npm and GitHub every time.
      release: { command: script("release.ts"), cache: false },
      ci: { command: script("ci.ts"), cache: false },
      trust: { command: script("trust.ts"), cache: false },
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
