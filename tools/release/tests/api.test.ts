import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import { apiDeclarations, apiReportFile, checkApiReports, lineDiff } from "../src/api";
import { readPublishedPackages } from "../src/workspace";

const declarations = `import { Base } from "@x/base";
//#region src/zeta.d.ts
/**
 * Docs that change often – with an en dash, "quotes" and 日本語.
 */
declare function zeta(value: string): string;
declare function zeta(value: number): number;
//#endregion
//#region src/alpha.d.ts
interface Alpha extends Base {
  /** The first field. */
  readonly first: string;
  readonly second: number;
}
//#endregion
export { Alpha, type Base, zeta };
`;

describe("API reports", () => {
  test("keep declarations and exports, drop comments and region markers", () => {
    expect(apiDeclarations(declarations)).toBe(
      [
        "import {",
        "  Base,",
        '} from "@x/base";',
        "",
        "interface Alpha extends Base {",
        "  readonly first: string;",
        "  readonly second: number;",
        "}",
        "declare function zeta(value: string): string;",
        "declare function zeta(value: number): number;",
        "",
        "export {",
        "  Alpha,",
        "  type Base,",
        "  zeta,",
        "};",
      ].join("\n"),
    );
  });

  test("don't change when only comments or declaration order change", () => {
    const reordered = `import { Base } from "@x/base";
//#region src/alpha.d.ts
interface Alpha extends Base {
  /** First. */
  readonly first: string;
  readonly second: number;
}
//#endregion
//#region src/zeta.d.ts
/** Reworded docs. */
declare function zeta(value: string): string;
declare function zeta(value: number): number;
//#endregion
export { zeta, type Base, Alpha };
`;

    expect(apiDeclarations(reordered)).toBe(apiDeclarations(declarations));
  });

  test("change when a signature changes, and the diff shows the lines", () => {
    const before = apiDeclarations(declarations);
    const after = apiDeclarations(
      declarations.replace("readonly second: number;", "readonly second?: number;"),
    );

    expect(lineDiff(before, after)).toEqual([
      "-   readonly second: number;",
      "+   readonly second?: number;",
    ]);
  });

  test("an export added to the entry point changes the report", () => {
    const before = apiDeclarations(declarations);
    const after = apiDeclarations(
      declarations.replace("export { Alpha", "declare const omega: 1;\nexport { omega, Alpha"),
    );

    expect(lineDiff(before, after)).toEqual(["+ declare const omega: 1;", "+   omega,"]);
  });

  test("keep reference directives and deprecation markers", () => {
    const report = apiDeclarations(`/// <reference types="node" />
//#region src/old.d.ts
/**
 * Use \`zeta\` instead.
 * @deprecated since 1.1
 */
declare function old(): void;
interface Options {
  /** @deprecated Use \`second\`. */
  readonly first?: string;
}
//#endregion
export { Options, old };
`);

    expect(report).toContain('/// <reference types="node" />');
    expect(report).toContain("/** @deprecated */\ndeclare function old(): void;");
    expect(report).toContain("  /** @deprecated */\n  readonly first?: string;");
    expect(report).not.toContain("Use `zeta`");
  });

  test("declarations split into chunks are an error, not a partial report", () => {
    expect(() => apiDeclarations('export { a } from "./chunk-a.mjs";\n')).toThrow(
      'imports "./chunk-a.mjs"',
    );
  });

  test("an unreviewed API change fails against the committed report, and update rewrites it", async () => {
    const root = await mkdtemp(join(tmpdir(), "release-api-"));
    try {
      const packageRoot = join(root, "packages/example");
      await mkdir(join(packageRoot, "dist"), { recursive: true });
      await writeFile(
        join(packageRoot, "package.json"),
        JSON.stringify({
          name: "@x/example",
          version: "1.0.0",
          publishConfig: {
            exports: { ".": { types: "./dist/index.d.mts", import: "./dist/index.mjs" } },
          },
        }),
      );
      const build = (signature: string) =>
        writeFile(join(packageRoot, "dist/index.d.mts"), `${signature}\nexport { answer };\n`);
      const packages = await readPublishedPackages(root, [{ directory: "example", budgets: {} }]);

      await build("declare function answer(): number;");
      await checkApiReports(packages, { update: true });
      await expect(checkApiReports(packages)).resolves.toBeUndefined();

      await build("declare function answer(): string;");
      await expect(checkApiReports(packages)).rejects.toThrow(
        /@x\/example:\n\s+- declare function answer\(\): number;\n\s+\+ declare function answer\(\): string;/,
      );

      await checkApiReports(packages, { update: true });
      expect(await readFile(join(packageRoot, apiReportFile), "utf8")).toContain(
        "declare function answer(): string;",
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("a long diff says how much it left out", () => {
    const before = Array.from({ length: 80 }, (_, index) => `line ${index}`).join("\n");
    const lines = lineDiff(before, "", 60);

    expect(lines).toHaveLength(61);
    expect(lines.at(-1)).toBe("… and 21 more changed lines");
  });

  test("a file that doesn't parse is an error", () => {
    expect(() => apiDeclarations("export declare function (: ;")).toThrow("Cannot parse");
  });
});
