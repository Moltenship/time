import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { useId, useState, type CSSProperties, type ReactNode } from "react";

import { hexToOklch, isColor } from "./color";

export const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:ring-offset-1 focus-visible:ring-offset-fd-background";
const textInput = `w-full rounded-md border bg-fd-background px-2 py-1 font-mono text-xs text-fd-foreground aria-invalid:border-fd-error ${focusRing}`;

/** The attribute the builder's scoped CSS styles: the preview, and the swatches beside controls. */
export const PREVIEW_SCOPE = "data-theme-preview";

/** An element styled by the theme being built, outside the preview, such as a swatch. */
export function Scoped({
  className,
  dark,
  style,
  children,
}: {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly dark: boolean;
  readonly style?: CSSProperties;
}) {
  return (
    <span
      {...{ [PREVIEW_SCOPE]: "" }}
      className={`${dark ? "dark " : ""}${className ?? ""}`}
      style={style}
    >
      {children}
    </span>
  );
}

/** Pill-shaped options, one pressed: the preview's view and mode, a recipe, the CSS's extent. */
export function Segmented<TValue extends string>({
  label,
  onValueChange,
  options,
  value,
}: {
  readonly label: string;
  readonly onValueChange: (value: TValue) => void;
  readonly options: readonly { readonly label: string; readonly value: TValue }[];
  readonly value: TValue;
}) {
  return (
    <ToggleGroup
      aria-label={label}
      className="flex flex-wrap gap-1 rounded-full bg-fd-muted p-1"
      onValueChange={([next]) => {
        if (next !== undefined) onValueChange(next as TValue);
      }}
      value={[value]}
    >
      {options.map((option) => (
        <Toggle
          key={option.value}
          className={`rounded-full px-3 py-1 text-sm text-fd-foreground transition-colors hover:bg-fd-background/60 data-pressed:bg-fd-background data-pressed:font-medium data-pressed:shadow-sm ${focusRing}`}
          value={option.value}
        >
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}

export function ResetButton({
  changed,
  label,
  onReset,
}: {
  readonly changed: boolean;
  readonly label: string;
  readonly onReset: () => void;
}) {
  return (
    <button
      aria-label={`Reset ${label}`}
      className={`grid size-7 shrink-0 place-items-center rounded-md text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground disabled:invisible ${focusRing}`}
      disabled={!changed}
      onClick={onReset}
      title={`Reset ${label}`}
      type="button"
    >
      <svg
        aria-hidden
        className="size-3.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        viewBox="0 0 24 24"
      >
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
      </svg>
    </button>
  );
}

/**
 * Text that commits only once it is a colour, so a half-typed value never blanks the preview, and
 * goes back to the committed value on blur.
 */
function ValueInput({
  describedBy,
  id,
  label,
  onChange,
  value,
}: {
  readonly describedBy?: string;
  readonly id: string;
  readonly label?: string;
  readonly onChange: (value: string) => void;
  readonly value: string;
}) {
  const [draft, setDraft] = useState(value);
  const [committed, setCommitted] = useState(value);
  if (committed !== value) {
    setCommitted(value);
    // A change from elsewhere, such as the picker or a reset; typing keeps its own text.
    if (draft.trim() !== value) setDraft(value);
  }
  const valid = (text: string) => text.trim() !== "" && !/[;{}<>]/.test(text) && isColor(text);

  return (
    <input
      aria-describedby={describedBy}
      aria-invalid={!valid(draft) || undefined}
      aria-label={label}
      autoCapitalize="off"
      autoComplete="off"
      className={textInput}
      id={id}
      onBlur={() => setDraft(value)}
      onChange={(event) => {
        const text = event.target.value;
        setDraft(text);
        if (valid(text)) onChange(text.trim());
      }}
      spellCheck={false}
      type="text"
      value={draft}
    />
  );
}

export interface Swatch {
  readonly alpha: number;
  readonly hex: string;
}

/**
 * A colour token: a swatch painted by the theme being built that opens the colour picker, and its
 * CSS value, which may be any colour, including `var()` and `color-mix()`.
 */
export function ColorControl({
  changed,
  dark,
  label,
  name,
  onChange,
  onReset,
  swatch,
  value,
}: {
  readonly changed: boolean;
  readonly dark: boolean;
  readonly label: string;
  readonly name: string;
  readonly onChange: (value: string) => void;
  readonly onReset: () => void;
  /** The browser's reading of the colour, once the preview has painted it. */
  readonly swatch?: Swatch;
  readonly value: string;
}) {
  const id = useId();

  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1">
      {/* The picker lies over the swatch, so the swatch shows the colour as the theme paints it,
          over the theme's background. */}
      <span className="relative size-7 overflow-hidden rounded-md border has-focus-visible:ring-2 has-focus-visible:ring-fd-ring">
        <Scoped
          className="absolute inset-0"
          dark={dark}
          style={{ background: `linear-gradient(var(${name}), var(${name})), var(--background)` }}
        />
        <input
          aria-label={`${label}: pick a colour`}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
          onChange={(event) => onChange(hexToOklch(event.target.value, swatch?.alpha ?? 1))}
          type="color"
          value={swatch?.hex ?? "#000000"}
        />
      </span>
      <label className="min-w-0 leading-tight" htmlFor={id}>
        <span className="block truncate text-sm text-fd-foreground">{label}</span>
        <code className="block truncate text-xs text-fd-muted-foreground">{name}</code>
      </label>
      <ResetButton changed={changed} label={label} onReset={onReset} />
      <div className="col-span-3">
        <ValueInput id={id} onChange={onChange} value={value} />
      </div>
    </div>
  );
}

/** A CSS value without a picker, such as an event colour derived from a hue and chroma. */
export function FormulaControl({
  changed,
  label,
  name,
  onChange,
  onReset,
  value,
}: {
  readonly changed: boolean;
  readonly label: string;
  readonly name: string;
  readonly onChange: (value: string) => void;
  readonly onReset: () => void;
  readonly value: string;
}) {
  const id = useId();
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1">
      <label className="min-w-0 leading-tight" htmlFor={id}>
        <span className="text-sm text-fd-foreground">{label}</span>{" "}
        <code className="text-xs text-fd-muted-foreground">{name}</code>
      </label>
      <ResetButton changed={changed} label={label} onReset={onReset} />
      <div className="col-span-2">
        <ValueInput id={id} onChange={onChange} value={value} />
      </div>
    </div>
  );
}

const trim = (value: number) => String(Number(value.toFixed(4)));

/** A number on a slider, with its value shown and spoken in its unit. */
export function SliderControl({
  changed,
  label,
  max,
  min,
  name,
  onChange,
  onReset,
  step,
  unit,
  value,
}: {
  readonly changed: boolean;
  readonly label: string;
  readonly max: number;
  readonly min: number;
  /** The token it sets, shown under the label. */
  readonly name?: string;
  readonly onChange: (value: number) => void;
  readonly onReset: () => void;
  readonly step: number;
  readonly unit: string;
  readonly value: number;
}) {
  const id = useId();
  const shown = `${trim(value)}${unit}`;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-1">
      <label className="min-w-0 leading-tight" htmlFor={id}>
        <span className="block truncate text-sm text-fd-foreground">{label}</span>
        {name === undefined ? null : (
          <code className="block truncate text-xs text-fd-muted-foreground">{name}</code>
        )}
      </label>
      <output className="font-mono text-xs text-fd-muted-foreground tabular-nums" htmlFor={id}>
        {shown}
      </output>
      <ResetButton changed={changed} label={label} onReset={onReset} />
      <input
        aria-valuetext={shown}
        className={`col-span-3 w-full accent-fd-primary ${focusRing}`}
        id={id}
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="range"
        value={value}
      />
    </div>
  );
}

/** A collapsible group of controls; `<details>` opens with Enter or Space on its summary. */
export function Section({
  children,
  defaultOpen = false,
  title,
}: {
  readonly children: ReactNode;
  readonly defaultOpen?: boolean;
  readonly title: string;
}) {
  return (
    <details className="group rounded-xl border bg-fd-card" open={defaultOpen}>
      <summary
        className={`flex cursor-pointer list-none items-center justify-between rounded-xl px-4 py-3 text-sm font-medium text-fd-foreground select-none [&::-webkit-details-marker]:hidden ${focusRing}`}
      >
        {title}
        <svg
          aria-hidden
          className="size-4 text-fd-muted-foreground transition-transform group-open:rotate-180"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="flex flex-col gap-4 border-t px-4 py-4">{children}</div>
    </details>
  );
}
