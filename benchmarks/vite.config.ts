import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    dts: false,
    entry: ["core/index.ts", "recurrence/index.ts", "shared/published-packages.ts"],
  },
  run: {
    tasks: {
      core: {
        cache: false,
        command:
          "node --expose-gc --import ./dist/shared/published-packages.mjs dist/core/index.mjs --mode=full --gated",
        dependsOn: ["build", { task: "build", from: "dependencies" }],
      },
      // Recurrence's bundle imports the iCalendar package, which isn't a direct dependency here.
      recurrence: {
        cache: false,
        command:
          "node --expose-gc --import ./dist/shared/published-packages.mjs dist/recurrence/index.mjs --mode=full --gated",
        dependsOn: ["build", { task: "build", from: "dependencies" }, "@moltenship/ics#build"],
      },
    },
  },
});
