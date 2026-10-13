import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vite-plus/test";

describe("the API reference", () => {
  test("names every export of @moltenship/calendar-recurrence", async () => {
    const index = await readFile(
      fileURLToPath(new URL("../../../packages/calendar-recurrence/src/index.ts", import.meta.url)),
      "utf8",
    );
    const page = await readFile(
      fileURLToPath(new URL("../content/docs/api/recurrence.mdx", import.meta.url)),
      "utf8",
    );
    const names = [...index.matchAll(/export (?:type )?\{([^}]*)\}/g)].flatMap((match) =>
      match[1]!
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name !== ""),
    );
    expect(names.length).toBeGreaterThan(60);
    expect(names.filter((name) => !page.includes(`\`${name}`))).toEqual([]);
  });
});
