import { test } from "vite-plus/test";

const fixture = process.env.SSR_KNOWN_BAD;

test.skipIf(fixture === undefined)("runs an intentionally failing SSR fixture", async () => {
  if (fixture === "hydration") {
    await import("./known-bad-hydration");
    return;
  }
  if (fixture === "browser-global") {
    await import("./known-bad-browser-global");
    return;
  }
  throw new Error(`Unknown SSR fixture: ${fixture}`);
});
