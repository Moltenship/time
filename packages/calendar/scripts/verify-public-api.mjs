import { readFile } from "node:fs/promises";

const [declaration, runtime, consumer] = await Promise.all([
  readFile(new URL("../dist/index.d.mts", import.meta.url), "utf8"),
  readFile(new URL("../dist/index.mjs", import.meta.url), "utf8"),
  readFile(new URL("../tests/public-custom-view.test.tsx", import.meta.url), "utf8"),
]);

if (!runtime.startsWith('"use client";')) {
  throw new Error('calendar facade runtime must preserve its "use client" boundary');
}
if (!declaration.includes('export * from "@moltenship/calendar-react"')) {
  throw new Error("calendar facade declarations do not expose the supported React API");
}
if (/\b(?:jotai|forwardRef)\b/u.test(declaration) || /\bforwardRef\b/u.test(runtime)) {
  throw new Error("calendar facade exposes a private store or legacy ref wrapper");
}
if (/\bas\s+(?:const|unknown|any|[A-Z])/u.test(consumer)) {
  throw new Error("public custom-view consumer uses a TypeScript cast");
}
if (/\b(?:jotai|src\/)\b/u.test(consumer)) {
  throw new Error("public custom-view consumer uses a private implementation path");
}

console.log("calendar facade preserves the client boundary and cast-free public custom-view API");
