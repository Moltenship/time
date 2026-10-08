import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    dts: {
      generator: "tsgo",
    },
    exports: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
});
