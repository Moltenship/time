import { readFile } from "node:fs/promises";
import path from "node:path";

import { transformAsync } from "@babel/core";
import stylexPlugin from "@stylexjs/babel-plugin";
import { expect, test } from "vite-plus/test";

import { defaultTheme, parseTheme, setToken, themeStylex } from "../components/theme-builder/theme";

const registry = path.join(import.meta.dirname, "../../../registry");
const source = parseTheme(
  await readFile(path.join(registry, "calendar-theme/calendar-theme.css"), "utf8"),
);
const shipped = defaultTheme(source);

/** The CSS StyleX's own compiler makes of the source, through the real tokens file. */
async function compile(code: string): Promise<string> {
  const result = await transformAsync(code, {
    babelrc: false,
    configFile: false,
    filename: path.join(registry, "calendar-theme.ts"),
    parserOpts: { plugins: ["typescript"] },
    plugins: [
      [
        stylexPlugin,
        {
          aliases: {
            "@/components/calendar-stylex/*": [path.join(registry, "stylex-calendar-theme/*")],
          },
          runtimeInjection: false,
          unstable_moduleResolution: { rootDir: registry, type: "commonJS" },
        },
      ],
    ],
  });
  const { stylex } = result!.metadata as { stylex?: readonly [string, { ltr: string }, number][] };
  return stylex!.map(([, { ltr }]) => ltr).join("\n");
}

/** Without the spaces StyleX drops around a value's commas. */
const compact = (text: string) => text.replace(/,\s+/g, ",");

test("the StyleX compiler takes the output, with its tokens and values", async () => {
  let theme = setToken(source, shipped, "light", "--calendar-today", "oklch(0.5 0.2 260)");
  theme = setToken(source, theme, "light", "--calendar-hour-height", "3.5rem");
  const css = compact(
    await compile(
      themeStylex(source, {
        ...theme,
        palette: { ...theme.palette, teal: { chroma: 0.14, hue: 200 } },
        shading: { ...theme.shading, recipe: "gradient" },
      }),
    ),
  );

  for (const declaration of [
    "--calendar-today:light-dark(oklch(0.5 0.2 260),oklch(0.707 0.165 254.6))",
    "--calendar-hour-height:3.5rem",
    "--calendar-event-teal-border:light-dark(oklch(0.63 0.14 200),oklch(0.72 0.14 200))",
    "--calendar-event-teal:light-dark(oklch(0.95 calc(0.14 * 0.3) 200),oklch(0.32 calc(0.14 * 0.45) 200))",
  ]) {
    expect(css).toContain(declaration);
  }
});

test("the StyleX compiler takes every token", async () => {
  const css = compact(await compile(themeStylex(source, shipped, { full: true })));

  for (const { name } of source.tokens) expect(css).toContain(`${name}:`);
  expect(css).toContain("--calendar-event-gray-foreground:");
  expect(css).toContain("--radius:0.625rem");
});
