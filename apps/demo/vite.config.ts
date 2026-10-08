import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    tsconfigPaths: true,
  },
  lint: { options: { typeAware: true, typeCheck: true } },
  fmt: {},
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
