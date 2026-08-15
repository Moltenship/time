import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const maximumRuntimeBytes = 28 * 1024;
const maximumGzipBytes = 6.25 * 1024;

const declarationUrl = new URL("../dist/index.d.mts", import.meta.url);
const runtimeUrl = new URL("../dist/index.mjs", import.meta.url);
const [declaration, runtime] = await Promise.all([
  readFile(declarationUrl, "utf8"),
  readFile(runtimeUrl, "utf8"),
]);

if (
  /from ["']jotai(?:\/[^"']*)?["']/u.test(declaration) ||
  /\b(?:Atom|PrimitiveAtom|WritableAtom)</u.test(declaration)
) {
  throw new Error("calendar-react public declarations expose private Jotai contracts");
}

if (!runtime.startsWith('"use client";')) {
  throw new Error('calendar-react runtime must preserve its "use client" boundary');
}

if (/\bforwardRef\b/u.test(runtime) || /\bforwardRef\b/u.test(declaration)) {
  throw new Error("calendar-react must use React 19 ref props instead of forwardRef");
}

if (!/\buseId\b/u.test(runtime)) {
  throw new Error("calendar-react runtime must generate deterministic React IDs");
}

const runtimeBytes = Buffer.byteLength(runtime);
const gzipBytes = gzipSync(runtime).byteLength;
if (runtimeBytes > maximumRuntimeBytes || gzipBytes > maximumGzipBytes) {
  throw new Error(
    `calendar-react runtime exceeds its size budget: ${runtimeBytes} raw / ${gzipBytes} gzip bytes`,
  );
}

console.log(`calendar-react public API verified (${runtimeBytes} raw / ${gzipBytes} gzip bytes)`);
