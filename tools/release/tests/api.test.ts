import { describe, expect, test } from "vite-plus/test";

import { apiDeclarations, lineDiff } from "../src/api";

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

  test("a file that doesn't parse is an error", () => {
    expect(() => apiDeclarations("export declare function (: ;")).toThrow("Cannot parse");
  });
});
