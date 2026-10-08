import { defineConfig } from "vite-plus";

// Tests import the registry source through the `@registry/*` paths in tsconfig.json.
export default defineConfig({
  resolve: { tsconfigPaths: true },
});
