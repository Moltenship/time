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
      consumer: { command: script("consumer.ts"), cache: false },
      "dry-run": { command: script("dry-run.ts"), cache: false },
      version: { command: script("version.ts"), cache: false },
      publish: { command: script("publish.ts"), cache: false },
      "registry-e2e": { command: script("registry.ts"), cache: false },
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
