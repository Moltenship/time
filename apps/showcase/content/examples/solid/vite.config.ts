// A reader's app uses Vite itself, not this repository's toolchain.
/* oxlint-disable vite-plus/prefer-vite-plus-imports */
// #region config
import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [solid()],
  optimizeDeps: {
    // One copy of ui-sdk's core in the dev server. The calendar and the agent bridge find each
    // other through it.
    exclude: ["@ui-sdk/core"],
  },
});
// #endregion config
