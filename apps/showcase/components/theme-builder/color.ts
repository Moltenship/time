/** Gamma-encoded sRGB channels and alpha, each from 0 to 1. */
export type Rgba = readonly [number, number, number, number];

/** A colour for a colour input, which has no alpha, and its alpha apart. */
export interface Swatch {
  readonly alpha: number;
  readonly hex: string;
}

const round = (value: number, digits: number) => Number(value.toFixed(digits));

/** `#rrggbb`, as a colour input gives it, in OKLCH with the theme's precision. */
export function hexToOklch(hex: string, alpha = 1): string {
  const [red, green, blue] = [1, 3, 5].map((start) => {
    const channel = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const long = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
  const medium = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
  const short = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);
  const l = 0.2104542553 * long + 0.793617785 * medium - 0.0040720468 * short;
  const a = 1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short;
  const b = 0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short;
  const c = Math.hypot(a, b);
  // A grey has no hue; 0 keeps the value short, as the theme writes its greys.
  const h = c < 0.0005 ? 0 : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  const body = `${round(l, 3)} ${round(c, 3)} ${round(h, 1)}`;
  return alpha < 1 ? `oklch(${body} / ${round(alpha, 2)})` : `oklch(${body})`;
}

export function toHex([red, green, blue]: Rgba): string {
  return `#${[red, green, blue]
    .map((channel) =>
      Math.round(channel * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
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

/** Whether the browser takes `value` as a colour; `var()` always passes. */
export function isColor(value: string): boolean {
  return typeof CSS === "undefined" || typeof CSS.supports !== "function"
    ? true
    : CSS.supports("color", value);
}

/**
 * Reads colours as the browser paints them inside the preview: a hidden probe in its scope
 * resolves an expression such as `var(--calendar-event)`, and a 1×1 canvas paints it, composited
 * over what lies under it. Null where the browser has no `OffscreenCanvas`, as in tests.
 */
export class ColorReader {
  readonly #context: OffscreenCanvasRenderingContext2D;
  readonly #probe: HTMLElement;
  readonly #relative = isColor("rgb(from red r g b)");

  private constructor(probe: HTMLElement, context: OffscreenCanvasRenderingContext2D) {
    this.#context = context;
    this.#probe = probe;
  }

  static create(probe: HTMLElement): ColorReader | null {
    if (typeof OffscreenCanvas === "undefined") return null;
    const context = new OffscreenCanvas(1, 1).getContext("2d", { willReadFrequently: true });
    return context === null ? null : new ColorReader(probe, context);
  }

  /** Reads under `[data-color="…"]`, for a palette colour's event tokens, or without one. */
  setColor(color: string | undefined): void {
    if (color === undefined) this.#probe.removeAttribute("data-color");
    else this.#probe.setAttribute("data-color", color);
  }

  swatch(expression: string): Swatch {
    this.#context.clearRect(0, 0, 1, 1);
    this.#paint(expression);
    const [, , , alpha] = this.#pixel();
    if (this.#relative) {
      this.#context.clearRect(0, 0, 1, 1);
      this.#paint(`rgb(from ${expression} r g b)`);
    }
    return { alpha, hex: toHex(this.#pixel()) };
  }

  /**
   * Two colours as they show, opaque: `back` painted over `--background`, then `front` over it.
   */
  pair(front: string, back: string): readonly [Rgba, Rgba] {
    this.#context.clearRect(0, 0, 1, 1);
    this.#paint("var(--background)");
    this.#paint(back);
    const under = this.#pixel();
    this.#paint(front);
    return [this.#pixel(), under];
  }

  #paint(expression: string) {
    this.#probe.style.color = expression;
    this.#context.fillStyle = getComputedStyle(this.#probe).color;
    this.#context.fillRect(0, 0, 1, 1);
  }

  #pixel(): Rgba {
    const [red, green, blue, alpha] = this.#context.getImageData(0, 0, 1, 1).data;
    return [red! / 255, green! / 255, blue! / 255, alpha! / 255];
  }
}
