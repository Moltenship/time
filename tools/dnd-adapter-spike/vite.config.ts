import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite-plus";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  build: {
    lib: {
      entry: resolve(root, "src/index.ts"),
      formats: ["es"],
    },
    rollupOptions: {
      external: [
        "@dnd-kit/dom",
        "@dnd-kit/dom/modifiers",
        "@dnd-kit/react",
        "react",
        "react/jsx-runtime",
      ],
    },
  },
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.spike.ts", "tests/**/*.spike.tsx"],
  },
});
