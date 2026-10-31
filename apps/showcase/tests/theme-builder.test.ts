import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vite-plus/test";

import { calendarEventColors } from "@registry/calendar-theme/event-colors";
import { composite, contrast, ThemeTokens } from "@registry/tests/theme-colors";

import { hexToOklch } from "../components/theme-builder/color";
import { contrastChecks } from "../components/theme-builder/contrast";
import { applyPreset, isPresetApplied, presets } from "../components/theme-builder/presets";
import {
  defaultTheme,
  isSafeValue,
  isThemeChanged,
  modeScopes,
  normalizeValue,
  parseTheme,
  previewCss,
  setToken,
  themeCss,
  themeStylex,
  type Theme,
} from "../components/theme-builder/theme";
import { eventColorLabels, tokenInfo } from "../components/theme-builder/tokens";

const css = await readFile(
  new URL("../../../registry/calendar-theme/calendar-theme.css", import.meta.url),
  "utf8",
);
const stylexTokens = await readFile(
  new URL("../../../registry/stylex-calendar-theme/calendar-tokens.stylex.ts", import.meta.url),
  "utf8",
);
const source = parseTheme(css);
const shipped = defaultTheme(source);

/** Every custom property a rule of the file declares, by a plain scan of its text. */
function declaredIn(selector: string): string[] {
  const start = css.indexOf(`  ${selector} {`);
  const body = css.slice(start, css.indexOf("\n  }", start));
  return [...body.matchAll(/^\s+(--[\w-]+):/gm)].map(([, name]) => name!);
}

describe("one source of truth", () => {
  test("the builder has every token of :root and .dark, and no other", () => {
    const names = source.tokens.map(({ name }) => name);

    expect(names).toEqual(declaredIn(":root"));
    expect(names).toEqual(expect.arrayContaining(declaredIn(".dark")));
    expect(Object.keys(tokenInfo).toSorted()).toEqual(names.toSorted());
  });

  test("defaults are the file's values, with .dark over :root", () => {
    const token = (name: string) => source.tokens.find((candidate) => candidate.name === name);

    expect(token("--calendar-hour-height")).toEqual({
      dark: "3rem",
      inDark: false,
      kind: "length",
      light: "3rem",
      name: "--calendar-hour-height",
    });
    expect(token("--calendar-grid")).toMatchObject({ dark: "var(--border)", kind: "color" });
    expect(token("--calendar-today")).toMatchObject({
      dark: "oklch(0.707 0.165 254.6)",
      light: "oklch(0.52 0.215 262.9)",
    });
    expect(source.eventColor.dark["--calendar-event"]).toBe(
      "oklch(0.32 calc(var(--calendar-event-chroma) * 0.45) var(--calendar-event-hue))",
    );
  });

  test("the palette is the file's, in the order of event-colors.ts", () => {
    expect(source.palette.map(({ name }) => name)).toEqual([...calendarEventColors]);
    expect(source.palette[0]).toEqual({ chroma: 0.17, hue: 258, name: "blue" });
  });

  test("presets, contrast checks and labels name only what the file declares", () => {
    const names = new Set(source.tokens.map(({ name }) => name));
    for (const preset of presets) {
      for (const name of [...Object.keys(preset.light ?? {}), ...Object.keys(preset.dark ?? {})]) {
        expect(names, `${preset.name}: ${name}`).toContain(name);
      }
      for (const mode of ["light", "dark"] as const) {
        for (const name of Object.keys(preset.eventColor?.[mode] ?? {})) {
          expect(source.eventColor[mode], `${preset.name}: ${name}`).toHaveProperty([name]);
        }
      }
    }
    for (const { back, front } of contrastChecks) {
      const tokens = [...`${back} ${front}`.matchAll(/var\((--[\w-]+)\)/g)];
      expect(tokens.length).toBeGreaterThan(1);
      for (const [, name] of tokens) expect(names).toContain(name);
    }
    expect(Object.keys(eventColorLabels).toSorted()).toEqual(
      Object.keys(source.eventColor.light).toSorted(),
    );
  });

  test("lengths have a slider and colours don't", () => {
    for (const { kind, name } of source.tokens) {
      expect(tokenInfo[name]?.range !== undefined, name).toBe(kind === "length");
    }
  });
});

describe("copied CSS", () => {
  test("says so when nothing changed", () => {
    expect(isThemeChanged(source, shipped)).toBe(false);
    // Settings of a recipe that's off still count, so Reset all can clear them.
    expect(isThemeChanged(source, { ...shipped, shading: { ...shipped.shading, fade: 2 } })).toBe(
      true,
    );
    expect(themeCss(source, shipped)).toBe(
      "/* No changes: the theme is calendar-theme.css as it ships. */\n",
    );
  });

  test("holds only the changed tokens, light in :root and dark in .dark", () => {
    let theme = setToken(source, shipped, "dark", "--calendar-now", "oklch(0.8 0.1 30)");
    theme = setToken(source, theme, "light", "--calendar-hour-height", "4rem");

    expect(isThemeChanged(source, theme)).toBe(true);
    expect(themeCss(source, theme)).toBe(
      [
        "@layer base {",
        "  :root {",
        "    --calendar-hour-height: 4rem;",
        "  }",
        "",
        "  .dark {",
        "    --calendar-now: oklch(0.8 0.1 30);",
        "  }",
        "}",
        "",
      ].join("\n"),
    );
  });

  test("keeps a dark value that a light change would override", () => {
    // Pasted after the theme, `:root` comes after the theme's `.dark`, so it would win in dark mode.
    const theme = setToken(source, shipped, "light", "--primary", "oklch(0.5 0.2 260)");

    expect(themeCss(source, theme)).toContain(
      ":root {\n    --primary: oklch(0.5 0.2 260);\n  }\n\n  .dark {\n    --primary: oklch(0.922 0 0);\n  }",
    );
    // Light and dark are edited apart, so even a token .dark doesn't set keeps its dark value.
    const grid = setToken(source, shipped, "light", "--calendar-grid", "var(--input)");
    expect(themeCss(source, grid)).toContain(".dark {\n    --calendar-grid: var(--border);");
  });

  test("edits the palette and the colours derived from it", () => {
    const theme: Theme = {
      ...shipped,
      eventColor: {
        ...shipped.eventColor,
        dark: { ...shipped.eventColor.dark, "--calendar-event-foreground": "oklch(1 0 0)" },
      },
      palette: { ...shipped.palette, teal: { chroma: 0.14, hue: 200 } },
    };

    expect(themeCss(source, theme)).toBe(
      [
        "@layer base {",
        "  .dark [data-color] {",
        "    --calendar-event-foreground: oklch(1 0 0);",
        "  }",
        "",
        '  [data-color="teal"] {',
        "    --calendar-event-hue: 200;",
        "    --calendar-event-chroma: 0.14;",
        "  }",
        "}",
        "",
      ].join("\n"),
    );
  });

  test("the full set restates every token, the event colours and the palette", () => {
    const full = themeCss(source, shipped, { full: true });

    for (const { name } of source.tokens) expect(full).toContain(`    ${name}: `);
    for (const color of calendarEventColors) expect(full).toContain(`[data-color="${color}"]`);
    expect(full).toContain("  [data-color] {\n");
    expect(full).toContain("  .dark [data-color] {\n");
    // Resolved by the same reader as the theme's contrast test, it is the shipped theme.
    for (const mode of ["light", "dark"] as const) {
      const pasted = new ThemeTokens(full, mode);
      const original = new ThemeTokens(css, mode);
      for (const name of ["--calendar-today", "--calendar-event", "--calendar-grid"]) {
        expect(pasted.color(name)).toEqual(original.color(name));
      }
    }
  });

  test("adds the shading recipe after the tokens, unlayered", () => {
    const gradient = themeCss(source, {
      ...shipped,
      shading: { ...shipped.shading, fade: 2, recipe: "gradient" },
    });
    const hatching = themeCss(source, {
      ...shipped,
      shading: { ...shipped.shading, gap: 8, recipe: "hatching" },
    });

    expect(gradient).toMatch(/^\/\* Gradient: /);
    expect(gradient).toContain("--fade: min(calc(var(--calendar-hour-height) * 2), 50%);");
    expect(gradient).toContain('[data-slot="time-grid-unavailable"][data-opens-after] {');
    expect(hatching).toContain(
      "color-mix(in oklch, var(--muted-foreground) 25%, transparent) 8px 9px",
    );
    expect(hatching).not.toContain("@layer");
  });
});

/**
 * The custom properties `calendar-theme.css` followed by a paste declares, as the cascade picks
 * them: in light mode, under `<html class="dark">`, where `:root` and `.dark` meet on one element
 * and the later rule wins, and on an element inside a nested `.dark`, which inherits `:root` from
 * the page and takes `.dark` on itself. `.dark [data-color]` outranks `[data-color]` by
 * specificity, wherever it comes.
 */
function cascade(text: string) {
  const rules = [...text.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{};]+)\{([^{}]*)\}/g)].map(
    ([, selector, body]) => {
      const declarations: Record<string, string> = {};
      for (const declaration of body!.split(";")) {
        const [name, value] = declaration.split(/:(.*)/s).map((part) => part.trim());
        if (name?.startsWith("--") && value) declarations[name] = normalizeValue(value);
      }
      return [selector!.trim(), declarations] as const;
    },
  );
  const apply = (...selectors: string[]): Record<string, string> =>
    Object.assign(
      {},
      ...rules.filter(([selector]) => selectors.includes(selector)).map(([, value]) => value),
    );
  return {
    darkHtml: apply(":root", ".dark"),
    darkNested: { ...apply(":root"), ...apply(".dark") },
    eventDark: { ...apply("[data-color]"), ...apply(".dark [data-color]") },
    eventLight: apply("[data-color]"),
    light: apply(":root"),
    palette: (name: string) => apply(`[data-color="${name}"]`),
  };
}

describe("pasted after the theme", () => {
  const edits: Record<string, Theme> = {
    "a light-only primary": setToken(source, shipped, "light", "--primary", "oklch(0.5 0.2 260)"),
    "a dark-only now line": setToken(
      source,
      shipped,
      "dark",
      "--calendar-now",
      "oklch(0.8 0.1 30)",
    ),
    "light-only grid lines": setToken(source, shipped, "light", "--calendar-grid", "var(--input)"),
    "a primary the same in both modes": setToken(
      source,
      setToken(source, shipped, "light", "--primary", "oklch(0.5 0.2 260)"),
      "dark",
      "--primary",
      "oklch(0.5 0.2 260)",
    ),
    "a taller hour": setToken(source, shipped, "light", "--calendar-hour-height", "4rem"),
    ...Object.fromEntries(
      presets.map((preset) => [`the ${preset.name} preset`, applyPreset(source, shipped, preset)]),
    ),
  };

  describe.each(Object.entries(edits))("%s", (_, theme) => {
    test.each([false, true])("gives every mode its values, full: %s", (full) => {
      const result = cascade(`${css}\n${themeCss(source, theme, { full })}`);
      const value = (text: string | undefined) =>
        text === undefined ? text : normalizeValue(text);

      for (const { name } of source.tokens) {
        expect(result.light[name], `${name}, light`).toBe(value(theme.light[name]));
        expect(result.darkHtml[name], `${name}, html.dark`).toBe(value(theme.dark[name]));
        expect(result.darkNested[name], `${name}, nested .dark`).toBe(value(theme.dark[name]));
      }
      for (const name of Object.keys(source.eventColor.light)) {
        expect(result.eventLight[name]).toBe(value(theme.eventColor.light[name]));
        expect(result.eventDark[name]).toBe(value(theme.eventColor.dark[name]));
      }
      for (const { name } of source.palette) {
        const { chroma, hue } = theme.palette[name]!;
        expect(result.palette(name)).toMatchObject({
          "--calendar-event-chroma": String(chroma),
          "--calendar-event-hue": String(hue),
        });
      }
    });
  });

  test("a size is not restated in .dark, since both modes share it", () => {
    expect(themeCss(source, edits["a taller hour"]!)).not.toContain(".dark");
  });
});

/** The object a theme's source passes to `createTheme`, parsed. */
function createThemeTokens(text: string): Record<string, string> {
  const body = /createTheme\(calendarVars, (\{[\s\S]*?\n\})\);/.exec(text)?.[1] ?? "{}";
  return JSON.parse(body.replace(/,\n\}$/, "\n}")) as Record<string, string>;
}

/** The defaults in `calendar-tokens.stylex.ts`, by a plain scan of its text. */
const tokensFileDefaults = Object.fromEntries(
  [
    ...stylexTokens
      .slice(0, stylexTokens.indexOf("stylex.defineVars"))
      .matchAll(/"(--[\w-]+)":\s*"([^"]+)"/g),
  ].map(([, name, value]) => [name!, value!]),
);

describe("StyleX theme", () => {
  const eventTokens = (color: string) => [
    `--calendar-event-${color}`,
    `--calendar-event-${color}-foreground`,
    `--calendar-event-${color}-border`,
  ];

  test("says so when nothing changed", () => {
    expect(themeStylex(source, shipped)).toBe(
      "// No changes: the theme is calendar-tokens.stylex.ts as it ships.\n",
    );
  });

  test("holds the changed tokens, one value per token", () => {
    let theme = setToken(source, shipped, "light", "--calendar-today", "oklch(0.5 0.2 260)");
    theme = setToken(source, theme, "dark", "--calendar-today", "oklch(0.7 0.16 255)");
    theme = setToken(source, theme, "light", "--calendar-hour-height", "3.5rem");

    expect(
      themeStylex(source, setToken(source, shipped, "dark", "--calendar-now", "red")),
    ).toContain('"--calendar-now": "light-dark(oklch(0.637 0.237 25.3), red)",');
    expect(themeStylex(source, theme)).toBe(
      [
        'import * as stylex from "@stylexjs/stylex";',
        "",
        'import { calendarVars } from "@/components/calendar-stylex/calendar-tokens.stylex";',
        "",
        "export const calendarTheme = stylex.createTheme(calendarVars, {",
        // `--calendar-selection` reads today's colour, so it comes along.
        '  "--calendar-today": "light-dark(oklch(0.5 0.2 260), oklch(0.7 0.16 255))",',
        '  "--calendar-selection": "light-dark(color-mix(in oklch, var(--calendar-today) 12%, transparent), color-mix(in oklch, var(--calendar-today) 18%, transparent))",',
        '  "--calendar-hour-height": "3.5rem",',
        "});",
        "",
      ].join("\n"),
    );
  });

  test("a value the same in both modes stands alone, and a length never uses light-dark()", () => {
    const both = setToken(
      source,
      setToken(source, shipped, "light", "--calendar-now", "oklch(0.6 0.2 30)"),
      "dark",
      "--calendar-now",
      "oklch( 0.6  0.2 30 )",
    );
    expect(createThemeTokens(themeStylex(source, both))).toEqual({
      "--calendar-now": "oklch(0.6 0.2 30)",
    });
    const apart: Theme = {
      ...shipped,
      dark: { ...shipped.dark, "--radius": "1rem" },
      light: { ...shipped.light, "--radius": "0.5rem" },
    };
    expect(createThemeTokens(themeStylex(source, apart))).toEqual({ "--radius": "0.5rem" });
  });

  test("restates what reads a changed token, which a wrapper wouldn't reach otherwise", () => {
    const tokens = createThemeTokens(
      themeStylex(source, setToken(source, shipped, "light", "--primary", "oklch(0.5 0.2 260)")),
    );

    expect(Object.keys(tokens)).toEqual([
      "--primary",
      "--calendar-event",
      "--calendar-event-border",
    ]);
    expect(tokens["--calendar-event-border"]).toBe("var(--primary)");
    // Through a chain: the grid reads the axis, which reads the muted text.
    const chain = setToken(
      source,
      setToken(source, shipped, "light", "--calendar-grid", "var(--calendar-axis)"),
      "light",
      "--muted-foreground",
      "red",
    );
    expect(Object.keys(createThemeTokens(themeStylex(source, chain)))).toEqual(
      expect.arrayContaining(["--muted-foreground", "--calendar-axis", "--calendar-grid"]),
    );
    // A formula reading a changed token follows too, in every colour.
    const formula: Theme = {
      ...setToken(source, shipped, "light", "--primary", "red"),
      eventColor: {
        ...shipped.eventColor,
        light: { ...shipped.eventColor.light, "--calendar-event-border": "var(--primary)" },
      },
    };
    expect(createThemeTokens(themeStylex(source, formula))).toHaveProperty([
      "--calendar-event-gray-border",
    ]);
  });

  test("a palette colour gives its three tokens, computed from the formulas", () => {
    const theme: Theme = {
      ...shipped,
      palette: { ...shipped.palette, teal: { chroma: 0.14, hue: 200 } },
    };

    expect(createThemeTokens(themeStylex(source, theme))).toEqual({
      "--calendar-event-teal":
        "light-dark(oklch(0.95 calc(0.14 * 0.3) 200), oklch(0.32 calc(0.14 * 0.45) 200))",
      "--calendar-event-teal-foreground":
        "light-dark(oklch(0.37 calc(0.14 * 0.8) 200), oklch(0.93 calc(0.14 * 0.35) 200))",
      "--calendar-event-teal-border": "light-dark(oklch(0.63 0.14 200), oklch(0.72 0.14 200))",
    });
  });

  test("a formula change reaches every colour, and leaves the :root tokens alone", () => {
    const theme: Theme = {
      ...shipped,
      eventColor: {
        ...shipped.eventColor,
        dark: { ...shipped.eventColor.dark, "--calendar-event-foreground": "oklch(1 0 0)" },
        light: { ...shipped.eventColor.light, "--calendar-event-foreground": "oklch(1 0 0)" },
      },
    };
    const tokens = createThemeTokens(themeStylex(source, theme));

    expect(Object.keys(tokens)).toEqual(calendarEventColors.flatMap(eventTokens));
    expect(tokens["--calendar-event-red-foreground"]).toBe("oklch(1 0 0)");
    expect(tokens).not.toHaveProperty(["--calendar-event-foreground"]);
  });

  test("the :root event tokens are ordinary tokens", () => {
    const theme = setToken(source, shipped, "light", "--calendar-event-foreground", "red");

    expect(Object.keys(createThemeTokens(themeStylex(source, theme)))).toEqual([
      "--calendar-event-foreground",
    ]);
  });

  test("no value can leave its string", () => {
    const value = 'red", "--x": "y';
    const theme = setToken(source, shipped, "light", "--calendar-now", value);
    const tokens = createThemeTokens(themeStylex(source, theme));

    expect(tokens["--calendar-now"]).toContain(value);
    expect(tokens).not.toHaveProperty(["--x"]);
  });

  describe("the shading recipe", () => {
    const closers = (text: string) => text.split("*/").length - 1;

    test.each([
      ["gradient", "--fade: min(calc(var(--calendar-hour-height) * 1.5), 50%);"],
      ["hatching", "color-mix(in oklch, var(--muted-foreground) 25%, transparent) 6px 7px"],
    ] as const)("%s comes after the theme, as a comment for the global CSS", (recipe, line) => {
      const output = themeStylex(source, {
        ...setToken(source, shipped, "light", "--calendar-now", "red"),
        shading: { ...shipped.shading, recipe },
      });
      const comment = output.slice(output.indexOf("// Put this in your app's global CSS"));

      expect(output.indexOf("});")).toBeLessThan(output.indexOf(comment));
      expect(comment).toContain(line);
      expect(comment).toContain('[data-slot="time-grid-unavailable"]');
      // The recipe's own comments would end the block, so only the block's closer is left.
      expect(closers(output)).toBe(1);
      expect(output.trimEnd().endsWith("*/")).toBe(true);
    });

    test("stands alone without a change, and nothing in it ends the comment", () => {
      const output = themeStylex(source, {
        ...shipped,
        shading: {
          ...shipped.shading,
          fade: "*/ alert(1) /*" as unknown as number,
          recipe: "gradient",
        },
      });

      expect(output).not.toContain("createTheme");
      expect(closers(output)).toBe(1);
    });

    test("is left out when flat, even with its settings changed", () => {
      expect(
        themeStylex(source, { ...shipped, shading: { ...shipped.shading, fade: 2 } }),
      ).toContain("No changes");
    });
  });

  describe("agrees with calendar-tokens.stylex.ts", () => {
    const full = createThemeTokens(themeStylex(source, shipped, { full: true }));

    test("the same tokens, both ways", () => {
      expect(Object.keys(full).toSorted()).toEqual(Object.keys(tokensFileDefaults).toSorted());
      // What a container sets, not a token: the file reads it through a constant.
      expect(full).not.toHaveProperty(["--calendar-surface"]);
      expect(source.tokens.map(({ name }) => name)).not.toContain("--calendar-surface");
    });

    test.each(Object.keys(tokensFileDefaults))("%s has the file's value or fallback", (name) => {
      // A base colour reads the Astryx theme around it first, then `calendar-theme.css`'s value.
      const fallback = /^var\(--[\w-]+, (.*)\)$/.exec(tokensFileDefaults[name]!)?.[1];
      // Lighter in the file's dark, for Astryx's lighter dark surface, as the file says.
      if (name === "--calendar-today") {
        expect(tokensFileDefaults[name]).toContain("oklch(0.73 0.15 254.6)");
        return;
      }

      expect(full[name]).toBe(fallback ?? tokensFileDefaults[name]);
    });
  });
});

describe("preview CSS", () => {
  test("sets every token of both modes, following the page or a picked mode", () => {
    const theme = setToken(source, shipped, "dark", "--calendar-now", "oklch(0.8 0.1 30)");
    const preview = previewCss(source, theme, "[data-theme-preview]");
    const scopes = modeScopes("[data-theme-preview]");

    expect(scopes.light).toBe(
      ':is(:root:not(.dark) [data-theme-preview]:not([data-mode="dark"]), [data-theme-preview][data-mode="light"])',
    );
    expect(preview).toContain(`${scopes.light} {\n  --radius: 0.625rem;`);
    const [light, dark] = preview.split(`${scopes.dark} {`);
    expect(light).toContain("  --calendar-now: oklch(0.637 0.237 25.3);");
    expect(dark).toContain("  --calendar-now: oklch(0.8 0.1 30);");
    expect(preview).toContain(
      `${scopes.dark} [data-color] {\n  --calendar-event: oklch(0.32 calc(var(--calendar-event-chroma) * 0.45) var(--calendar-event-hue));`,
    );
    expect(preview).toContain('[data-theme-preview] [data-color="gray"] {');
  });

  test("only values that stay inside their declaration go in", () => {
    for (const value of [
      "oklch(0.5 0.1 30 / 0.5)",
      "var(--primary)",
      "color-mix(in oklch, red 5%, transparent)",
    ]) {
      expect(isSafeValue(value), value).toBe(true);
    }
    for (const value of [
      "",
      "red;",
      "red} body { color: red",
      "red /* brand",
      "var(--x, */ red)",
      "red !important",
      'url("x")',
      "\\72 ed",
      "</style>",
      "oklch(0.6 0.2 30",
      "var(--primary",
      "var(--x) [",
      "var(--x))",
    ]) {
      expect(isSafeValue(value), value).toBe(false);
    }
  });
});

describe("presets", () => {
  test("colours and sizes apply apart, and a preset knows when it is applied", () => {
    const ocean = presets.find(({ name }) => name === "Ocean")!;
    const compact = presets.find(({ name }) => name === "Compact")!;
    const theme = applyPreset(source, applyPreset(source, shipped, ocean), compact);

    expect(theme.light["--primary"]).toBe("oklch(0.488 0.217 264)");
    expect(theme.dark["--calendar-hour-height"]).toBe("2.5rem");
    expect(isPresetApplied(source, theme, ocean)).toBe(true);
    expect(isPresetApplied(source, theme, compact)).toBe(true);
    expect(isPresetApplied(source, shipped, ocean)).toBe(false);
    expect(
      isPresetApplied(source, setToken(source, theme, "light", "--primary", "red"), ocean),
    ).toBe(false);
  });

  test("Astryx neutral sets every token that reads the Astryx theme's colours", () => {
    const astryx = presets.find(({ name }) => name === "Astryx neutral")!;
    const mapped = Object.entries(tokensFileDefaults)
      .filter(([, value]) => /^var\(--(?:color|focus)-/.test(value))
      .map(([name]) => name)
      .toSorted();

    expect(Object.keys(astryx.light!).toSorted()).toEqual(mapped);
    expect(Object.keys(astryx.dark!).toSorted()).toEqual(
      [...mapped, "--calendar-today"].toSorted(),
    );
  });

  // The contrast the shipped theme guarantees, in registry/tests/theme-contrast.test.ts.
  describe.each(presets.filter(({ kind }) => kind === "colors"))("$name", (preset) => {
    const pasted = themeCss(source, applyPreset(source, shipped, preset), { full: true });

    test.each(["light", "dark"] as const)("keeps the theme's contrast in %s", (mode) => {
      const tokens = new ThemeTokens(pasted, mode);
      const surface = tokens.color("--background");
      for (const color of [undefined, ...calendarEventColors]) {
        const event = new ThemeTokens(pasted, mode, color);
        expect(
          contrast(event.color("--calendar-event-foreground"), event.color("--calendar-event")),
          `event text on ${color ?? "default"} events`,
        ).toBeGreaterThanOrEqual(4.5);
      }
      expect(
        contrast(tokens.color("--calendar-today-foreground"), tokens.color("--calendar-today")),
      ).toBeGreaterThanOrEqual(4.5);
      expect(contrast(tokens.color("--calendar-today"), surface)).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(
          tokens.color("--calendar-today"),
          tokens.paint("--calendar-selection", "--background"),
        ),
      ).toBeGreaterThanOrEqual(4.5);
      expect(contrast(tokens.color("--calendar-now"), surface)).toBeGreaterThanOrEqual(3);
      expect(
        contrast(
          tokens.color("--foreground"),
          tokens.paint("--calendar-unavailable", "--background"),
        ),
      ).toBeGreaterThanOrEqual(4.5);
      const [red, green, blue] = tokens.color("--ring");
      expect(contrast(composite([red, green, blue, 0.5], surface), surface)).toBeGreaterThanOrEqual(
        3,
      );
    });
  });
});

test("a colour input's hex becomes OKLCH", () => {
  expect(hexToOklch("#ffffff")).toBe("oklch(1 0 0)");
  expect(hexToOklch("#000000")).toBe("oklch(0 0 0)");
  expect(hexToOklch("#ff0000")).toBe("oklch(0.628 0.258 29.2)");
  expect(hexToOklch("#2563eb", 0.12)).toBe("oklch(0.546 0.215 262.9 / 0.12)");
});
