import { readFile } from "node:fs/promises";

const runtime = await readFile(new URL("../dist/index.mjs", import.meta.url), "utf8");

// Bundling must keep the directive, or every React export would leak into the server graph.
if (!runtime.startsWith('"use client";')) {
  throw new Error('calendar-react runtime must preserve its "use client" boundary');
}

// The size budget lives with the others in tools/release/src/config.ts (`vp run release:size`).
console.log('calendar-react public API verified: the "use client" boundary is in place');
