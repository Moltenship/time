import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    dts: false,
    entry: ["core/index.ts", "react/index.ts", "run.ts"],
    tsconfig: "tsconfig.build.json",
  },
  lint: { options: { typeAware: true, typeCheck: true } },
  fmt: {},
  run: {
    tasks: {
      core: {
        cache: false,
        command: "node dist/core/index.mjs --mode=full --gated",
        dependsOn: ["build", { task: "build", from: "dependencies" }],
      },
      gated: {
        cache: false,
        command: "node dist/run.mjs --mode=full --gated",
        dependsOn: ["build", { task: "build", from: "dependencies" }],
      },
      react: {
        cache: false,
        command: "node dist/react/index.mjs --mode=full",
        dependsOn: ["build", { task: "build", from: "dependencies" }],
      },
      smoke: {
        cache: false,
        command: "node dist/run.mjs --mode=smoke",
        dependsOn: ["build", { task: "build", from: "dependencies" }],
      },
    },
  },
});
