import { readFile } from "node:fs/promises";

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

console.log("calendar-react public API keeps Jotai private and preserves the client boundary");
