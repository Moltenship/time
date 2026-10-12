import {
  defaultTheme,
  normalizeValue,
  type Declarations,
  type Mode,
  type Theme,
  type ThemeSource,
} from "./theme";

/**
 * A starting point: colours replace every colour, the palette included, and density replaces the
 * sizes. Anything a preset leaves out is the shipped value.
 */
export interface Preset {
  readonly dark?: Declarations;
  readonly eventColor?: Partial<Record<Mode, Declarations>>;
  readonly kind: "colors" | "density";
  /** Light values, and the sizes, which both modes share. */
  readonly light?: Declarations;
  readonly name: string;
}

/** A solid fill per palette colour, with white text, for themes that want bold events. */
const solidEvents = {
  dark: {
    "--calendar-event":
      "oklch(0.45 calc(var(--calendar-event-chroma) * 0.8) var(--calendar-event-hue))",
    "--calendar-event-border": "oklch(0.72 var(--calendar-event-chroma) var(--calendar-event-hue))",
    "--calendar-event-foreground": "oklch(0.985 0 0)",
  },
  light: {
    "--calendar-event": "oklch(0.52 var(--calendar-event-chroma) var(--calendar-event-hue))",
    "--calendar-event-border": "oklch(0.4 var(--calendar-event-chroma) var(--calendar-event-hue))",
    "--calendar-event-foreground": "oklch(0.985 0 0)",
  },
} satisfies Record<Mode, Declarations>;

export const presets: readonly Preset[] = [
  { kind: "colors", name: "Neutral" },
  {
    dark: {
      "--calendar-today": "oklch(0.746 0.16 232)",
      "--primary": "oklch(0.707 0.165 254.6)",
    },
    kind: "colors",
    light: {
      "--calendar-today": "oklch(0.5 0.15 230)",
      "--primary": "oklch(0.488 0.217 264)",
    },
    name: "Ocean",
  },
  {
    dark: {
      "--calendar-now": "oklch(0.8 0.14 70)",
      "--calendar-today": "oklch(0.76 0.14 160)",
      "--primary": "oklch(0.78 0.13 155)",
    },
    kind: "colors",
    light: {
      "--background": "oklch(0.99 0.006 145)",
      "--calendar-now": "oklch(0.6 0.16 60)",
      "--calendar-today": "oklch(0.5 0.13 160)",
      "--card": "oklch(0.99 0.006 145)",
      "--primary": "oklch(0.48 0.12 155)",
    },
    name: "Forest",
  },
  {
    dark: {
      "--calendar-event": "oklch(0.45 0.16 310)",
      "--calendar-event-border": "var(--primary)",
      "--calendar-event-foreground": "oklch(0.985 0 0)",
      "--calendar-today": "var(--primary)",
      "--calendar-today-foreground": "var(--primary-foreground)",
      "--primary": "oklch(0.72 0.16 310)",
    },
    eventColor: solidEvents,
    kind: "colors",
    light: {
      "--calendar-event": "var(--primary)",
      "--calendar-event-border": "color-mix(in oklch, var(--primary) 70%, oklch(0 0 0))",
      "--calendar-event-foreground": "var(--primary-foreground)",
      "--calendar-today": "var(--primary)",
      "--calendar-today-foreground": "var(--primary-foreground)",
      "--primary": "oklch(0.5 0.2 310)",
    },
    name: "Plum, solid events",
  },
  {
    kind: "density",
    light: {
      "--calendar-event-padding-x": "0.25rem",
      "--calendar-event-padding-y": "0.125rem",
      "--calendar-hour-height": "2.5rem",
      "--radius": "0.375rem",
    },
    name: "Compact",
  },
  { kind: "density", name: "Default" },
  {
    kind: "density",
    light: {
      "--calendar-event-padding-x": "0.5rem",
      "--calendar-event-padding-y": "0.375rem",
      "--calendar-hour-height": "4.5rem",
      "--radius": "0.875rem",
    },
    name: "Roomy",
  },
];

/** The theme with a preset's part replaced: its colours or its sizes. */
export function applyPreset(source: ThemeSource, theme: Theme, preset: Preset): Theme {
  const shipped = defaultTheme(source);
  const light: Record<string, string> = { ...theme.light };
  const dark: Record<string, string> = { ...theme.dark };
  for (const token of source.tokens) {
    if ((token.kind === "length") !== (preset.kind === "density")) continue;
    const lightValue = preset.light?.[token.name];
    light[token.name] = lightValue ?? token.light;
    // Sizes are the same in both modes; a colour's dark value is its own.
    dark[token.name] =
      token.kind === "length"
        ? (lightValue ?? token.dark)
        : (preset.dark?.[token.name] ?? token.dark);
  }
  if (preset.kind === "density") return { ...theme, dark, light };
  return {
    ...theme,
    dark,
    eventColor: {
      dark: { ...shipped.eventColor.dark, ...preset.eventColor?.dark },
      light: { ...shipped.eventColor.light, ...preset.eventColor?.light },
    },
    light,
    palette: shipped.palette,
  };
}

/** Whether the theme's colours, or its sizes, are a preset's. */
export function isPresetApplied(source: ThemeSource, theme: Theme, preset: Preset): boolean {
  const applied = applyPreset(source, theme, preset);
  const modes = ["light", "dark"] as const;
  return (
    source.tokens.every((token) =>
      modes.every(
        (mode) =>
          normalizeValue(theme[mode][token.name]!) === normalizeValue(applied[mode][token.name]!),
      ),
    ) &&
    modes.every((mode) =>
      Object.keys(applied.eventColor[mode]).every(
        (name) =>
          normalizeValue(theme.eventColor[mode][name]!) ===
          normalizeValue(applied.eventColor[mode][name]!),
      ),
    ) &&
    source.palette.every(
      ({ name }) =>
        theme.palette[name]?.hue === applied.palette[name]?.hue &&
        theme.palette[name]?.chroma === applied.palette[name]?.chroma,
    )
  );
}
