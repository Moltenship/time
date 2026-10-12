import { contrast, type ColorReader } from "./color";

export interface ContrastCheck {
  readonly back: string;
  readonly front: string;
  readonly label: string;
  /** WCAG 2.2 AA: 4.5:1 for text, 3:1 for graphics. */
  readonly minimum: number;
  /** Checked for the default event colours and every palette colour; the worst one counts. */
  readonly palette?: boolean;
}

/**
 * The pairs `registry/tests/theme-contrast.test.ts` holds the shipped theme to, on `--background`,
 * plus body text and the hour labels.
 */
export const contrastChecks: readonly ContrastCheck[] = [
  { back: "var(--background)", front: "var(--foreground)", label: "Text", minimum: 4.5 },
  {
    back: "var(--calendar-event)",
    front: "var(--calendar-event-foreground)",
    label: "Event text",
    minimum: 4.5,
    palette: true,
  },
  {
    back: "var(--calendar-today)",
    front: "var(--calendar-today-foreground)",
    label: "Text on today",
    minimum: 4.5,
  },
  {
    back: "var(--background)",
    front: "var(--calendar-today)",
    label: "Today's weekday",
    minimum: 4.5,
  },
  {
    back: "var(--calendar-selection)",
    front: "var(--calendar-today)",
    label: "Today on the selection",
    minimum: 4.5,
  },
  {
    back: "var(--background)",
    front: "var(--calendar-axis)",
    label: "Hour and weekday labels",
    minimum: 4.5,
  },
  {
    back: "var(--calendar-unavailable)",
    front: "var(--foreground)",
    label: "Text on closed time",
    minimum: 4.5,
  },
  {
    back: "var(--calendar-closed)",
    front: "var(--foreground)",
    label: "Dates on closed days",
    minimum: 4.5,
  },
  {
    back: "var(--calendar-closed)",
    front: "var(--muted-foreground)",
    label: "Muted dates on closed days",
    minimum: 4.5,
  },
  { back: "var(--background)", front: "var(--calendar-now)", label: "Now line", minimum: 3 },
  { back: "var(--background)", front: "var(--ring)", label: "Focus ring", minimum: 3 },
  {
    // The `ring-ring/50` halo of shadcn controls, such as the toolbar's buttons.
    back: "var(--background)",
    front: "color-mix(in srgb, var(--ring) 50%, transparent)",
    label: "Focus ring halo",
    minimum: 3,
  },
  { back: "var(--background)", front: "var(--calendar-busy)", label: "Busy dot", minimum: 3 },
  { back: "var(--background)", front: "var(--calendar-free)", label: "Free dot", minimum: 3 },
  {
    back: "var(--background)",
    front: "var(--calendar-invalid)",
    label: "Rejected change",
    minimum: 3,
  },
  {
    back: "var(--background)",
    front: "var(--calendar-warning)",
    label: "Flagged change",
    minimum: 3,
  },
];

export interface ContrastResult {
  readonly label: string;
  readonly minimum: number;
  readonly ratio: number;
  /** The palette colour with the lowest ratio, when it is below the minimum. */
  readonly worst?: string;
}

/** Each check's ratio as the preview paints it. */
export function readContrast(reader: ColorReader, palette: readonly string[]): ContrastResult[] {
  return contrastChecks.map(({ back, front, label, minimum, palette: perColor }) => {
    let ratio = Number.POSITIVE_INFINITY;
    let worst: string | undefined;
    for (const color of perColor === true ? [undefined, ...palette] : [undefined]) {
      reader.setColor(color);
      const value = contrast(...reader.pair(front, back));
      if (value < ratio) [ratio, worst] = [value, color];
    }
    reader.setColor(undefined);
    return { label, minimum, ratio, ...(ratio < minimum && worst !== undefined ? { worst } : {}) };
  });
}
