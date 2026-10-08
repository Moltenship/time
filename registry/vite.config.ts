import { defineConfig } from "vite-plus";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  lint: { options: { typeAware: true, typeCheck: true } },
  fmt: {},
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
