import { defaultExclude, defineConfig } from "vite-plus";

// Tests import the registry source through the `@registry/*` paths in tsconfig.json. The Solid
// samples' own test compiles Solid's JSX, in a project of the root's `vp test`
// (`content/examples/solid/mount`), so it stays out of this app's run.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    setupFiles: ["./tests/setup.ts"],
    exclude: [...defaultExclude, "content/examples/solid/**"],
  },
});
