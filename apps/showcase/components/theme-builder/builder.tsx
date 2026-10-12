"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import { ResourcePreviewIsland } from "@/components/calendar-preview/island";

import type { ThemeCalendarView } from "./calendar";
import { ColorReader } from "./color";
import { readContrast, type ContrastResult } from "./contrast";
import {
  ColorControl,
  focusRing,
  FormulaControl,
  PREVIEW_SCOPE,
  ResetButton,
  Scoped,
  Section,
  Segmented,
  SliderControl,
  type Swatch,
} from "./controls";
import { CssOutput } from "./css-output";
import { ThemeCalendarIsland } from "./island";
import { applyPreset, isPresetApplied, presets, type Preset } from "./presets";
import {
  defaultShading,
  defaultTheme,
  isPaletteChanged,
  isThemeChanged,
  isTokenChanged,
  normalizeValue,
  previewCss,
  setToken,
  type Mode,
  type Shading,
  type Theme,
  type ThemeSource,
  type ThemeToken,
} from "./theme";
import { eventColorLabels, tokenInfo, type TokenGroup } from "./tokens";

type PreviewView = ThemeCalendarView | "resources";

const views: readonly { readonly label: string; readonly value: PreviewView }[] = [
  { label: "Week", value: "week" },
  { label: "Day", value: "day" },
  { label: "Month", value: "month" },
  { label: "Agenda", value: "agenda" },
  { label: "People and rooms", value: "resources" },
];
const modes: readonly { readonly label: string; readonly value: Mode }[] = [
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
];
const recipes: readonly { readonly label: string; readonly value: Shading["recipe"] }[] = [
  { label: "Flat", value: "flat" },
  { label: "Gradient", value: "gradient" },
  { label: "Hatching", value: "hatching" },
];

const SCOPE = `[${PREVIEW_SCOPE}]`;

function subscribeToDocsTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributeFilter: ["class"] });
  return () => observer.disconnect();
}

const docsMode = (): Mode =>
  document.documentElement.classList.contains("dark") ? "dark" : "light";
const serverMode = (): Mode => "light";

/** A length in rem, or undefined for one in another unit. */
function rem(value: string): number | undefined {
  const number = Number.parseFloat(value);
  if (value.endsWith("rem")) return number;
  return value.endsWith("px") ? number / 16 : undefined;
}

const trim = (value: number) => String(Number(value.toFixed(4)));
const capitalize = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);

/** Colour presets and density presets, each a row of toggle buttons, and a reset for all. */
function Presets({
  onApply,
  onReset,
  source,
  theme,
}: {
  readonly onApply: (preset: Preset) => void;
  readonly onReset: () => void;
  readonly source: ThemeSource;
  readonly theme: Theme;
}) {
  const id = useId();
  const row = (kind: Preset["kind"], label: string) => (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-fd-muted-foreground" id={`${id}-${kind}`}>
        {label}
      </span>
      <div aria-labelledby={`${id}-${kind}`} className="flex flex-wrap gap-1.5" role="group">
        {presets
          .filter((preset) => preset.kind === kind)
          .map((preset) => (
            <button
              key={preset.name}
              aria-pressed={isPresetApplied(source, theme, preset)}
              className={`rounded-full border px-3 py-1 text-sm text-fd-foreground transition-colors hover:bg-fd-accent aria-pressed:border-fd-primary aria-pressed:bg-fd-primary aria-pressed:text-fd-primary-foreground ${focusRing}`}
              onClick={() => onApply(preset)}
              type="button"
            >
              {preset.name}
            </button>
          ))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-fd-card p-4">
      {row("colors", "Colour presets")}
      {row("density", "Density presets")}
      <button
        className={`self-start rounded-md border px-3 py-1.5 text-sm text-fd-foreground transition-colors hover:bg-fd-accent disabled:opacity-50 disabled:hover:bg-transparent ${focusRing}`}
        disabled={!isThemeChanged(source, theme)}
        onClick={onReset}
        type="button"
      >
        Reset all
      </button>
    </div>
  );
}

/** The contrast of the pairs the theme's own test checks, as the preview paints them. */
function Contrast({
  mode,
  results,
}: {
  readonly mode: Mode;
  readonly results: readonly ContrastResult[];
}) {
  const id = useId();
  if (results.length === 0) return null;
  return (
    <section aria-labelledby={id} className="rounded-xl border bg-fd-card p-4">
      <h3 className="mb-2 text-sm font-medium text-fd-foreground" id={id}>
        Contrast, {mode}
      </h3>
      <ul className="grid gap-x-6 gap-y-1 text-sm @xl:grid-cols-2">
        {results.map(({ label, minimum, ratio, worst }) => {
          const passes = ratio >= minimum;
          return (
            <li key={label} className="flex items-baseline justify-between gap-3">
              <span className="text-fd-muted-foreground">
                {label}
                {worst === undefined ? null : `, ${worst} events`}
              </span>
              <span
                className={`shrink-0 font-mono text-xs tabular-nums ${passes ? "text-fd-foreground" : "font-medium text-fd-error"}`}
              >
                {ratio.toFixed(1)}:1 {passes ? "passes" : `needs ${minimum}:1`}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Every token of `calendar-theme.css` beside a live calendar. Edits restyle only the preview: its
 * CSS is scoped to the preview's attribute, so the docs page keeps its own theme.
 */
export default function ThemeBuilder({ source }: { readonly source: ThemeSource }) {
  const [theme, setTheme] = useState(() => defaultTheme(source));
  const docs = useSyncExternalStore(subscribeToDocsTheme, docsMode, serverMode);
  // The mode picked here holds until the docs switch theme; then the preview follows the docs.
  const [picked, setPicked] = useState<{ readonly docs: Mode; readonly mode: Mode } | null>(null);
  const mode = picked?.docs === docs ? picked.mode : docs;
  const dark = mode === "dark";
  const [view, setView] = useState<PreviewView>("week");
  const probe = useRef<HTMLSpanElement>(null);
  const [swatches, setSwatches] = useState<Readonly<Record<string, Swatch>>>({});
  const [contrast, setContrast] = useState<readonly ContrastResult[]>([]);

  // The browser's own reading of the colours, for the colour pickers and the contrast checks.
  useEffect(() => {
    const reader = probe.current === null ? null : ColorReader.create(probe.current);
    if (reader === null) return;
    setSwatches(
      Object.fromEntries(
        source.tokens
          .filter(({ kind }) => kind === "color")
          .map(({ name }) => [name, reader.swatch(`var(${name})`)]),
      ),
    );
    setContrast(
      readContrast(
        reader,
        source.palette.map(({ name }) => name),
      ),
    );
  }, [mode, source, theme]);

  const tokens = (group: TokenGroup) =>
    source.tokens.filter(({ name }) => tokenInfo[name]?.group === group);
  const label = (name: string) => tokenInfo[name]?.label ?? name;

  const colorControl = (token: ThemeToken) => (
    <ColorControl
      key={token.name}
      changed={isTokenChanged(source, theme, mode, token.name)}
      dark={dark}
      label={label(token.name)}
      name={token.name}
      onChange={(value) =>
        setTheme((current) => setToken(source, current, mode, token.name, value))
      }
      onReset={() =>
        setTheme((current) => setToken(source, current, mode, token.name, token[mode]))
      }
      swatch={swatches[token.name]}
      value={theme[mode][token.name]!}
    />
  );

  const lengthControl = (token: ThemeToken) => {
    const range = tokenInfo[token.name]?.range ?? { max: 4, min: 0, step: 0.125 };
    return (
      <SliderControl
        key={token.name}
        changed={isTokenChanged(source, theme, "light", token.name)}
        label={label(token.name)}
        max={range.max}
        min={range.min}
        name={token.name}
        onChange={(value) =>
          setTheme((current) => setToken(source, current, "light", token.name, `${trim(value)}rem`))
        }
        onReset={() =>
          setTheme((current) => setToken(source, current, "light", token.name, token.light))
        }
        step={range.step}
        unit="rem"
        value={rem(theme.light[token.name]!) ?? rem(token.light) ?? 0}
      />
    );
  };

  const setShading = (shading: Partial<Shading>) =>
    setTheme((current) => ({ ...current, shading: { ...current.shading, ...shading } }));

  const availability = tokens("availability");
  const closedTime = availability.filter(({ name }) =>
    ["--calendar-unavailable", "--calendar-closed"].includes(name),
  );

  return (
    <div className="not-prose @container my-6 flex flex-col gap-6">
      <div className="grid items-start gap-6 @4xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-3 @4xl:sticky @4xl:top-[calc(var(--fd-docs-row-1,0px)+1rem)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Segmented label="Preview" onValueChange={setView} options={views} value={view} />
            <Segmented
              label="Theme"
              onValueChange={(next) => setPicked({ docs, mode: next })}
              options={modes}
              value={mode}
            />
          </div>
          <div
            {...{ [PREVIEW_SCOPE]: "" }}
            className={`${dark ? "dark " : ""}h-[36rem] overflow-hidden rounded-xl border bg-background text-left text-foreground shadow-sm`}
          >
            <style>{previewCss(source, theme, mode, SCOPE)}</style>
            <span hidden ref={probe} />
            {view === "resources" ? (
              <ResourcePreviewIsland availability status view="timeline-week" />
            ) : (
              <ThemeCalendarIsland onViewChange={setView} view={view} />
            )}
          </div>
          <Contrast mode={mode} results={contrast} />
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <Presets
            onApply={(preset) => setTheme((current) => applyPreset(source, current, preset))}
            onReset={() => setTheme(defaultTheme(source))}
            source={source}
            theme={theme}
          />
          <Section defaultOpen title={`Calendar colours, ${mode}`}>
            {tokens("calendar").map(colorControl)}
          </Section>
          <Section title={`Events, ${mode}`}>
            {tokens("events").map(colorControl)}
            <p className="text-xs text-fd-muted-foreground">
              Events without a colour use these. A palette colour derives its own from a hue and a
              chroma, below.
            </p>
          </Section>
          <Section title="Event palette">
            {source.palette.map(({ name }) => {
              const { chroma, hue } = theme.palette[name]!;
              const shipped = source.palette.find((color) => color.name === name)!;
              const title = capitalize(name);
              const setColor = (change: Partial<{ chroma: number; hue: number }>) =>
                setTheme((current) => ({
                  ...current,
                  palette: { ...current.palette, [name]: { ...current.palette[name]!, ...change } },
                }));
              return (
                <fieldset key={name} className="flex flex-col gap-2">
                  <legend className="sr-only">{title}</legend>
                  <div className="flex items-center justify-between gap-2">
                    <Scoped className="inline-flex" dark={dark}>
                      <span
                        className="rounded-md border-s-3 border-calendar-event-border bg-calendar-event px-2 py-1 text-xs font-medium text-calendar-event-foreground"
                        data-color={name}
                      >
                        {title}
                      </span>
                    </Scoped>
                    <ResetButton
                      changed={isPaletteChanged(source, theme, name)}
                      label={title}
                      onReset={() => setColor({ chroma: shipped.chroma, hue: shipped.hue })}
                    />
                  </div>
                  <SliderControl
                    changed={hue !== shipped.hue}
                    label={`${title} hue`}
                    max={360}
                    min={0}
                    onChange={(value) => setColor({ hue: value })}
                    onReset={() => setColor({ hue: shipped.hue })}
                    step={1}
                    unit="°"
                    value={hue}
                  />
                  <SliderControl
                    changed={chroma !== shipped.chroma}
                    label={`${title} chroma`}
                    max={0.3}
                    min={0}
                    onChange={(value) => setColor({ chroma: value })}
                    onReset={() => setColor({ chroma: shipped.chroma })}
                    step={0.005}
                    unit=""
                    value={chroma}
                  />
                </fieldset>
              );
            })}
            <fieldset className="flex flex-col gap-3 border-t pt-4">
              <legend className="mb-1 text-sm font-medium text-fd-foreground">
                What every colour derives, {mode}
              </legend>
              {Object.keys(source.eventColor[mode]).map((name) => (
                <FormulaControl
                  key={name}
                  changed={
                    normalizeValue(theme.eventColor[mode][name]!) !==
                    normalizeValue(source.eventColor[mode][name]!)
                  }
                  label={eventColorLabels[name] ?? name}
                  name={name}
                  onChange={(value) =>
                    setTheme((current) => ({
                      ...current,
                      eventColor: {
                        ...current.eventColor,
                        [mode]: { ...current.eventColor[mode], [name]: value },
                      },
                    }))
                  }
                  onReset={() =>
                    setTheme((current) => ({
                      ...current,
                      eventColor: {
                        ...current.eventColor,
                        [mode]: {
                          ...current.eventColor[mode],
                          [name]: source.eventColor[mode][name]!,
                        },
                      },
                    }))
                  }
                  value={theme.eventColor[mode][name]!}
                />
              ))}
            </fieldset>
          </Section>
          <Section title={`Availability, ${mode}`}>
            {closedTime.map(colorControl)}
            <div className="flex flex-col gap-2">
              <span className="text-sm text-fd-foreground">Closed time in time grids</span>
              <Segmented
                label="Shading recipe"
                onValueChange={(recipe) => setShading({ recipe })}
                options={recipes}
                value={theme.shading.recipe}
              />
            </div>
            {theme.shading.recipe === "gradient" ? (
              <SliderControl
                changed={theme.shading.fade !== defaultShading.fade}
                label="Fade before open time"
                max={3}
                min={0.25}
                onChange={(fade) => setShading({ fade })}
                onReset={() => setShading({ fade: defaultShading.fade })}
                step={0.25}
                unit=" h"
                value={theme.shading.fade}
              />
            ) : theme.shading.recipe === "hatching" ? (
              <>
                <SliderControl
                  changed={theme.shading.gap !== defaultShading.gap}
                  label="Gap between lines"
                  max={16}
                  min={2}
                  onChange={(gap) => setShading({ gap })}
                  onReset={() => setShading({ gap: defaultShading.gap })}
                  step={1}
                  unit="px"
                  value={theme.shading.gap}
                />
                <SliderControl
                  changed={theme.shading.lines !== defaultShading.lines}
                  label="Line strength"
                  max={60}
                  min={5}
                  onChange={(lines) => setShading({ lines })}
                  onReset={() => setShading({ lines: defaultShading.lines })}
                  step={5}
                  unit="%"
                  value={theme.shading.lines}
                />
              </>
            ) : null}
            {availability.filter((token) => !closedTime.includes(token)).map(colorControl)}
          </Section>
          <Section title="Density">{tokens("density").map(lengthControl)}</Section>
          <Section title={`Base colours, ${mode}`}>
            <p className="text-xs text-fd-muted-foreground">
              The shadcn/ui tokens. Calendar tokens such as grid lines and event fills derive from
              them until you set those.
            </p>
            {tokens("base").map(colorControl)}
          </Section>
        </div>
      </div>
      <CssOutput source={source} theme={theme} />
    </div>
  );
}
