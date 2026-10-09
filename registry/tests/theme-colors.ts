import type { CalendarEventColor } from "../calendar-theme/event-colors";

/** Gamma-encoded sRGB channels and alpha, each from 0 to 1. */
export type Rgba = readonly [number, number, number, number];
type Oklch = { readonly alpha: number; readonly c: number; readonly h: number; readonly l: number };
type Declarations = Readonly<Record<string, string>>;

/** Each rule's declarations by selector, ignoring at-rule wrappers such as `@layer base`. */
function parseRules(css: string): Map<string, Declarations> {
  const rules = new Map<string, Declarations>();
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const [, selector, body] of source.matchAll(/([^{};]+)\{([^{}]*)\}/g)) {
    const declarations = Object.fromEntries(
      body!
        .split(";")
        .map((declaration) => declaration.split(/:(.*)/s).map((part) => part.trim()))
        .filter(([name, value]) => name?.startsWith("--") && value),
    );
    rules.set(selector!.trim(), declarations);
  }
  return rules;
}

/** Splits on commas outside parentheses. */
function splitArguments(text: string): string[] {
  const parts = [""];
  let depth = 0;
  for (const character of text) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "," && depth === 0) parts.push("");
    else parts[parts.length - 1] += character;
  }
  return parts.map((part) => part.trim());
}

/** The arguments of `name(...)` when `value` is exactly one such call. */
function call(value: string, name: string): string | undefined {
  return value.startsWith(`${name}(`) && value.endsWith(")")
    ? value.slice(name.length + 1, -1)
    : undefined;
}

/** Resolves the theme's custom properties for one theme and, optionally, one event colour. */
export class ThemeTokens {
  readonly #declarations: Declarations;

  constructor(css: string, theme: "light" | "dark", color?: CalendarEventColor) {
    const rules = parseRules(css);
    const scopes =
      theme === "light"
        ? [":root", "[data-color]"]
        : [":root", ".dark", "[data-color]", ".dark [data-color]"];
    if (color === undefined) scopes.splice(scopes.indexOf("[data-color]"));
    else scopes.push(`[data-color="${color}"]`);
    this.#declarations = Object.assign({}, ...scopes.map((scope) => rules.get(scope) ?? {}));
  }

  /** A colour token composited over an opaque one, as the browser paints it. */
  paint(token: string, over: string): Rgba {
    return composite(this.color(token), this.color(over));
  }

  color(token: string): Rgba {
    return toSrgb(this.#oklch(this.#value(token)));
  }

  #value(token: string): string {
    const value = this.#declarations[token];
    if (value === undefined) throw new Error(`Unknown token ${token}`);
    return value;
  }

  #oklch(value: string): Oklch {
    const variable = call(value, "var");
    if (variable !== undefined) return this.#oklch(this.#value(variable));
    if (value === "transparent") return { alpha: 0, c: 0, h: Number.NaN, l: 0 };

    const components = call(value, "oklch");
    if (components !== undefined) {
      const [channels, alpha] = components.split("/");
      const [l, c, h] = channels!
        .trim()
        .split(/\s+(?![^(]*\))/)
        .map((part) => this.#number(part));
      return { alpha: alpha === undefined ? 1 : this.#number(alpha.trim()), c: c!, h: h!, l: l! };
    }

    const mix = call(value, "color-mix");
    if (mix !== undefined) {
      const [space, first, second] = splitArguments(mix);
      if (space !== "in oklch") throw new Error(`Unsupported colour space in ${value}`);
      const [, color, percent] = /^(.*\))\s+([\d.]+%)$/s.exec(first!)!;
      return mixOklch(this.#oklch(color!), this.#oklch(second!), this.#number(percent!));
    }

    throw new Error(`Unsupported colour ${value}`);
  }

  #number(value: string): number {
    const variable = call(value, "var");
    if (variable !== undefined) return this.#number(this.#value(variable));
    const product = call(value, "calc");
    if (product !== undefined) {
      return product
        .split("*")
        .map((factor) => this.#number(factor.trim()))
        .reduce((left, right) => left * right);
    }
    return value.endsWith("%") ? Number.parseFloat(value) / 100 : Number.parseFloat(value);
  }
}

/** CSS `color-mix(in oklch, first p, second)`: premultiplied, an achromatic hue takes the other's. */
function mixOklch(first: Oklch, second: Oklch, p: number): Oklch {
  const alpha = first.alpha * p + second.alpha * (1 - p);
  const premultiplied = (key: "c" | "l") =>
    (first[key] * first.alpha * p + second[key] * second.alpha * (1 - p)) / alpha;
  const hueless = (color: Oklch) => Number.isNaN(color.h) || color.c === 0;
  const h = hueless(first)
    ? second.h
    : hueless(second)
      ? first.h
      : first.h * p + second.h * (1 - p);
  return { alpha, c: premultiplied("c"), h, l: premultiplied("l") };
}

/** OKLCH to gamma-encoded sRGB, clipped to the gamut as Chromium paints it. */
function toSrgb({ alpha, c, h, l }: Oklch): Rgba {
  const hue = ((Number.isNaN(h) ? 0 : h) * Math.PI) / 180;
  const a = c * Math.cos(hue);
  const b = c * Math.sin(hue);
  const long = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const medium = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const short = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const [red, green, blue] = [
    4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
    -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
    -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short,
  ].map((linear) => {
    const clipped = Math.min(1, Math.max(0, linear));
    return clipped <= 0.0031308 ? 12.92 * clipped : 1.055 * clipped ** (1 / 2.4) - 0.055;
  });
  return [red!, green!, blue!, alpha];
}

/** Source-over compositing in gamma-encoded sRGB, as browsers blend. */
export function composite(top: Rgba, bottom: Rgba): Rgba {
  const alpha = top[3];
  const [red, green, blue] = [0, 1, 2].map(
    (index) => top[index]! * alpha + bottom[index]! * (1 - alpha),
  );
  return [red!, green!, blue!, 1];
}

function luminance([red, green, blue]: Rgba): number {
  const [r, g, b] = [red, green, blue].map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** WCAG 2 contrast ratio between two opaque colours, from 1 to 21. */
export function contrast(first: Rgba, second: Rgba): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((x, y) => y - x);
  return (lighter! + 0.05) / (darker! + 0.05);
}
