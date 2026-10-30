import { fileURLToPath } from "node:url";

import stylex from "@stylexjs/unplugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

const fromHere = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig(({ command }) => ({
  plugins: [
    // Before React, and only over the files of the `/stylex/` page that import StyleX.
    stylex.vite({
      aliases: { "@registry/*": [fromHere("../../registry/*")] },
      // Into the `/stylex/` page's stylesheet, not the Tailwind page's.
      cssInjectionTarget: (fileName: string) => /(?:^|\/)stylex-[^/]+\.css$/u.test(fileName),
      dev: command === "serve",
      // Astryx's tokens use `light-dark()`, which older targets would lower, breaking its themes.
      lightningcssOptions: {
        targets: { chrome: 123 << 16, firefox: 120 << 16, safari: (17 << 16) | (5 << 8) },
      },
      runtimeInjection: false,
      unstable_moduleResolution: { rootDir: fromHere("../.."), type: "commonJS" },
    }),
    react(),
    tailwindcss(),
  ],
  build: {
    cssTarget: ["chrome123", "firefox120", "safari17.5"],
    rollupOptions: {
      // Two pages, so neither loads the other's global CSS: Tailwind's, and Astryx's.
      input: { main: fromHere("index.html"), stylex: fromHere("stylex/index.html") },
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
  lint: { options: { typeAware: true, typeCheck: true } },
  fmt: {},
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
  },
}));
