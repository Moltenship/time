import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const maximumRuntimeBytes = 28 * 1024;
const maximumGzipBytes = 7 * 1024;

const runtime = await readFile(new URL("../dist/index.mjs", import.meta.url), "utf8");

// Bundling must keep the directive, or every React export would leak into the server graph.
if (!runtime.startsWith('"use client";')) {
  throw new Error('calendar-react runtime must preserve its "use client" boundary');
}

const runtimeBytes = Buffer.byteLength(runtime);
const gzipBytes = gzipSync(runtime).byteLength;
if (runtimeBytes > maximumRuntimeBytes || gzipBytes > maximumGzipBytes) {
  throw new Error(
    `calendar-react runtime exceeds its size budget: ${runtimeBytes} raw / ${gzipBytes} gzip bytes`,
  );
}

console.log(`calendar-react public API verified (${runtimeBytes} raw / ${gzipBytes} gzip bytes)`);
