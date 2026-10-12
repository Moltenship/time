/**
 * The theme builder's model of `calendar-theme.css`: its tokens and their light and dark values,
 * the event palette, and a closed-time shading recipe, with the CSS an app pastes in and the CSS
 * that styles the preview.
 */

export type Mode = "light" | "dark";

export interface ThemeToken {
  /** `"length"` for sizes such as `3rem`, shared by both modes; `"color"` otherwise. */
  readonly kind: "color" | "length";
  /** Its value in `:root`. */
  readonly light: string;
  /** Its value under `.dark`: the `.dark` rule's, or the light one where that rule leaves it. */
  readonly dark: string;
  /** Whether the `.dark` rule sets it, rather than leaving it to `:root`. */
  readonly inDark: boolean;
  readonly name: string;
}

export interface PaletteColor {
  readonly chroma: number;
  readonly hue: number;
  readonly name: string;
}

/** Custom properties by name, as declared. */
export type Declarations = Readonly<Record<string, string>>;

/** What `calendar-theme.css` declares, read when the docs build. */
export interface ThemeSource {
  /** The three event tokens `[data-color]` derives from a colour's hue and chroma, per mode. */
  readonly eventColor: Readonly<Record<Mode, Declarations>>;
  readonly palette: readonly PaletteColor[];
  /** The tokens of `:root` and `.dark`, in the file's order. */
  readonly tokens: readonly ThemeToken[];
}

export type ShadingRecipe = "flat" | "gradient" | "hatching";

/** Closed time in time grids: a recipe from the Availability page, and its settings. */
export interface Shading {
  /** Hours the gradient fades over before open time. */
  readonly fade: number;
  /** Pixels between hatching lines. */
  readonly gap: number;
  /** Strength of the hatching lines, as a percentage of `--muted-foreground`. */
  readonly lines: number;
  readonly recipe: ShadingRecipe;
}

export const defaultShading: Shading = { fade: 1.5, gap: 6, lines: 25, recipe: "flat" };

/** A theme being built: every token's value per mode, the palette and the shading. */
export interface Theme {
  readonly dark: Declarations;
  readonly eventColor: Readonly<Record<Mode, Declarations>>;
  readonly light: Declarations;
  readonly palette: Readonly<Record<string, { readonly chroma: number; readonly hue: number }>>;
  readonly shading: Shading;
}

const LENGTH = /^-?\d*\.?\d+(?:rem|px|em)$/;
const PALETTE_SELECTOR = /^\[data-color="([a-z-]+)"\]$/;

/** One space between words, and none inside the parentheses a formatter wraps. */
export function normalizeValue(value: string): string {
  return value.trim().replace(/\s+/g, " ").replace(/\(\s/g, "(").replace(/\s\)/g, ")");
}

/** Each rule's custom properties by selector, in source order, ignoring at-rule wrappers. */
export function parseRules(css: string): ReadonlyMap<string, Declarations> {
  const rules = new Map<string, Declarations>();
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const [, selector, body] of source.matchAll(/([^{};]+)\{([^{}]*)\}/g)) {
    const declarations: Record<string, string> = {};
    for (const declaration of body!.split(";")) {
      const [name, value] = declaration.split(/:(.*)/s).map((part) => part.trim());
      if (name?.startsWith("--") && value) declarations[name] = normalizeValue(value);
    }
    rules.set(selector!.trim().replace(/\s+/g, " "), declarations);
  }
  return rules;
}

/** Reads the tokens, event colours and palette from the text of `calendar-theme.css`. */
export function parseTheme(css: string): ThemeSource {
  const rules = parseRules(css);
  const light = rules.get(":root") ?? {};
  const dark = rules.get(".dark") ?? {};
  for (const name of Object.keys(dark)) {
    if (!(name in light)) throw new Error(`${name} is set in .dark but not in :root`);
  }
  const lightEvent = rules.get("[data-color]") ?? {};
  const palette: PaletteColor[] = [];
  for (const [selector, declarations] of rules) {
    const name = PALETTE_SELECTOR.exec(selector)?.[1];
    if (name === undefined) continue;
    palette.push({
      chroma: Number(declarations["--calendar-event-chroma"]),
      hue: Number(declarations["--calendar-event-hue"]),
      name,
    });
  }
  return {
    eventColor: {
      dark: { ...lightEvent, ...rules.get(".dark [data-color]") },
      light: lightEvent,
    },
    palette,
    tokens: Object.entries(light).map(([name, value]) => ({
      dark: dark[name] ?? value,
      inDark: name in dark,
      kind: LENGTH.test(value) ? "length" : "color",
      light: value,
      name,
    })),
  };
}

/** The theme as `calendar-theme.css` ships it. */
export function defaultTheme(source: ThemeSource): Theme {
  return {
    dark: Object.fromEntries(source.tokens.map(({ dark, name }) => [name, dark])),
    eventColor: source.eventColor,
    light: Object.fromEntries(source.tokens.map(({ light, name }) => [name, light])),
    palette: Object.fromEntries(
      source.palette.map(({ chroma, hue, name }) => [name, { chroma, hue }]),
    ),
    shading: defaultShading,
  };
}

const same = (left: string | undefined, right: string | undefined) =>
  left !== undefined && right !== undefined && normalizeValue(left) === normalizeValue(right);

/**
 * Whether a typed value can go into a declaration as it is: no character that could end the
 * declaration or the rule, open a comment, or escape, and every bracket closed, since an open
 * `oklch(` would swallow the rules after it. Colour syntax is the browser's to check.
 */
export function isSafeValue(value: string): boolean {
  if (value.trim() === "" || /[;{}<>\\"'!]|\/\*|\*\//.test(value)) return false;
  const open: string[] = [];
  for (const character of value) {
    if (character === "(" || character === "[") open.push(character);
    else if (character === ")" || character === "]") {
      if (open.pop() !== (character === ")" ? "(" : "[")) return false;
    }
  }
  return open.length === 0;
}

/** Sets a token for one mode; a length is the same in both. */
export function setToken(
  source: ThemeSource,
  theme: Theme,
  mode: Mode,
  name: string,
  value: string,
): Theme {
  const shared = source.tokens.find((token) => token.name === name)?.kind === "length";
  return {
    ...theme,
    dark: shared || mode === "dark" ? { ...theme.dark, [name]: value } : theme.dark,
    light: shared || mode === "light" ? { ...theme.light, [name]: value } : theme.light,
  };
}

/** Whether a token differs from the shipped theme in a mode. */
export function isTokenChanged(source: ThemeSource, theme: Theme, mode: Mode, name: string) {
  const token = source.tokens.find((candidate) => candidate.name === name);
  return token !== undefined && !same(theme[mode][name], token[mode]);
}

export function isPaletteChanged(source: ThemeSource, theme: Theme, name: string): boolean {
  const shipped = source.palette.find((color) => color.name === name);
  const current = theme.palette[name];
  return shipped?.hue !== current?.hue || shipped?.chroma !== current?.chroma;
}

type Rule = readonly [selector: string, declarations: readonly (readonly [string, string])[]];

function formatRule([selector, declarations]: Rule, indent = ""): string {
  const lines = declarations.map(([name, value]) => `${indent}  ${name}: ${value};`);
  return [`${indent}${selector} {`, ...lines, `${indent}}`].join("\n");
}

/** The rules the theme sets inside `@layer base`, in the order of `calendar-theme.css`. */
function themeRules(source: ThemeSource, theme: Theme, full: boolean): Rule[] {
  const names = source.tokens.map(({ name }) => name);
  const root = names.filter((name) => full || isTokenChanged(source, theme, "light", name));
  // On `<html class="dark">`, a `:root` pasted after the theme comes after the theme's `.dark` and
  // wins, so a token it sets keeps another dark value only when `.dark` restates it. On a nested
  // `.dark` element the theme's `.dark` rule applies there directly, so a token that rule sets
  // needs restating whenever its dark value changed.
  const dark = source.tokens
    .filter(({ dark: shipped, inDark, name }) => {
      const value = theme.dark[name];
      if (root.includes(name) && !same(value, theme.light[name])) return true;
      return !same(value, shipped) && (inDark || !root.includes(name));
    })
    .map(({ name }) => name);
  const eventTokens = (mode: Mode) =>
    Object.keys(source.eventColor[mode]).filter(
      (name) => full || !same(theme.eventColor[mode][name], source.eventColor[mode][name]),
    );
  const palette = source.palette.filter(
    ({ name }) => full || isPaletteChanged(source, theme, name),
  );

  const rules: Rule[] = [
    [":root", root.map((name) => [name, theme.light[name]!])],
    [".dark", dark.map((name) => [name, theme.dark[name]!])],
    ["[data-color]", eventTokens("light").map((name) => [name, theme.eventColor.light[name]!])],
    [".dark [data-color]", eventTokens("dark").map((name) => [name, theme.eventColor.dark[name]!])],
    ...palette.map(({ name }): Rule => {
      const { chroma, hue } = theme.palette[name]!;
      return [
        `[data-color="${name}"]`,
        [
          ["--calendar-event-hue", String(hue)],
          ["--calendar-event-chroma", String(chroma)],
        ],
      ];
    }),
  ];
  return rules.filter(([, declarations]) => declarations.length > 0);
}

/** Whether the theme differs from `calendar-theme.css` as it ships, or the shading from flat. */
export function isThemeChanged(source: ThemeSource, theme: Theme): boolean {
  const { shading } = theme;
  return (
    themeRules(source, theme, false).length > 0 ||
    (Object.keys(defaultShading) as (keyof Shading)[]).some(
      (key) => shading[key] !== defaultShading[key],
    )
  );
}

/**
 * The shading recipe's rules, under `scope` when given. They follow the Availability page's
 * recipes, but leave the tint to `--calendar-unavailable`, which has its own control.
 */
export function shadingCss(shading: Shading, scope = ""): string {
  const band = `${scope}[data-slot="time-grid-unavailable"]`;
  switch (shading.recipe) {
    case "flat":
      return "";
    case "gradient":
      return [
        `/* Gradient: closed time fades out over the last ${shading.fade} hours before open time. */`,
        `${band} {`,
        "  /* Never more than half the band, so a short closure between open hours still shows. */",
        `  --fade: min(calc(var(--calendar-hour-height) * ${shading.fade}), 50%);`,
        "}",
        `${band}[data-opens-after] {`,
        "  mask-image: linear-gradient(to bottom, black calc(100% - var(--fade)), transparent);",
        "}",
        `${band}[data-opens-before] {`,
        "  mask-image: linear-gradient(to top, black calc(100% - var(--fade)), transparent);",
        "}",
        `${band}[data-opens-before][data-opens-after] {`,
        "  mask-image: linear-gradient(",
        "    transparent,",
        "    black var(--fade),",
        "    black calc(100% - var(--fade)),",
        "    transparent",
        "  );",
        "}",
      ].join("\n");
    case "hatching":
      return [
        "/* Hatching: closed time in diagonal lines, with closed dates tinted. */",
        `${band} {`,
        "  background: repeating-linear-gradient(",
        "    -45deg,",
        `    transparent 0 ${shading.gap}px,`,
        `    color-mix(in oklch, var(--muted-foreground) ${shading.lines}%, transparent) ${shading.gap}px ${shading.gap + 1}px`,
        "  );",
        "}",
        `${band}[data-reason="exception"] {`,
        "  background-color: var(--calendar-unavailable);",
        "}",
      ].join("\n");
  }
}

/**
 * The CSS to paste after `calendar-theme.css`: its `@layer base` structure with the changed tokens,
 * or with all of them when `full`, then the shading recipe, unlayered as on the Availability page.
 */
export function themeCss(source: ThemeSource, theme: Theme, { full = false } = {}): string {
  const rules = themeRules(source, theme, full);
  const shading = shadingCss(theme.shading);
  const parts = [
    rules.length === 0
      ? ""
      : ["@layer base {", rules.map((rule) => formatRule(rule, "  ")).join("\n\n"), "}"].join("\n"),
    shading,
  ].filter((part) => part !== "");
  return parts.length === 0
    ? "/* No changes: the theme is calendar-theme.css as it ships. */\n"
    : `${parts.join("\n\n")}\n`;
}

/**
 * Where each mode's preview CSS applies: elements with the `scope` attribute in that mode. A
 * `data-mode` attribute picks the mode; without one they follow the page's `.dark` class, so the
 * page renders in its own theme before the builder hydrates.
 */
export function modeScopes(scope: string): Readonly<Record<Mode, string>> {
  return {
    dark: `:is(.dark ${scope}:not([data-mode="light"]), ${scope}[data-mode="dark"])`,
    light: `:is(:root:not(.dark) ${scope}:not([data-mode="dark"]), ${scope}[data-mode="light"])`,
  };
}

/**
 * The CSS that styles the preview: every token and the event colours of both modes, the palette
 * and the shading, under `scope`. Unlayered, so it wins over the docs' own theme and over
 * `calendar-theme.css`, whose `.dark [data-color]` would otherwise reach a light preview on a
 * dark page.
 */
export function previewCss(source: ThemeSource, theme: Theme, scope: string): string {
  const scopes = modeScopes(scope);
  const rules: Rule[] = (["light", "dark"] as const).flatMap((mode): Rule[] => [
    [scopes[mode], source.tokens.map(({ name }): [string, string] => [name, theme[mode][name]!])],
    [`${scopes[mode]} [data-color]`, Object.entries(theme.eventColor[mode])],
  ]);
  for (const { name } of source.palette) {
    const { chroma, hue } = theme.palette[name]!;
    rules.push([
      `${scope} [data-color="${name}"]`,
      [
        ["--calendar-event-hue", String(hue)],
        ["--calendar-event-chroma", String(chroma)],
      ],
    ]);
  }
  return [...rules.map((rule) => formatRule(rule)), shadingCss(theme.shading, `${scope} `)]
    .filter((part) => part !== "")
    .join("\n");
}
