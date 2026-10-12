/**
 * How the builder shows each token of `calendar-theme.css`. The tokens and their values come from
 * the file; a test fails when one of them has no entry here, or an entry names no token.
 */

export type TokenGroup = "base" | "calendar" | "events" | "availability" | "density";

export interface TokenInfo {
  readonly group: TokenGroup;
  readonly label: string;
  /** A length's slider, in rem. */
  readonly range?: { readonly max: number; readonly min: number; readonly step: number };
}

export const tokenInfo: Readonly<Record<string, TokenInfo>> = {
  "--radius": {
    group: "density",
    label: "Corner radius",
    range: { max: 1.25, min: 0, step: 0.125 },
  },
  "--background": { group: "base", label: "Background" },
  "--foreground": { group: "base", label: "Text" },
  "--card": { group: "base", label: "Card" },
  "--card-foreground": { group: "base", label: "Text on cards" },
  "--popover": { group: "base", label: "Popover" },
  "--popover-foreground": { group: "base", label: "Text on popovers" },
  "--primary": { group: "base", label: "Primary" },
  "--primary-foreground": { group: "base", label: "Text on primary" },
  "--secondary": { group: "base", label: "Secondary" },
  "--secondary-foreground": { group: "base", label: "Text on secondary" },
  "--muted": { group: "base", label: "Muted" },
  "--muted-foreground": { group: "base", label: "Muted text" },
  "--accent": { group: "base", label: "Accent" },
  "--accent-foreground": { group: "base", label: "Text on accent" },
  "--destructive": { group: "base", label: "Destructive" },
  "--border": { group: "base", label: "Borders" },
  "--input": { group: "base", label: "Input borders" },
  "--ring": { group: "base", label: "Focus ring" },
  "--calendar-grid": { group: "calendar", label: "Grid lines" },
  "--calendar-axis": { group: "calendar", label: "Hour and weekday labels" },
  "--calendar-today": { group: "calendar", label: "Today" },
  "--calendar-today-foreground": { group: "calendar", label: "Text on today" },
  "--calendar-now": { group: "calendar", label: "Now line" },
  "--calendar-selection": { group: "calendar", label: "Selection" },
  "--calendar-weekend": { group: "calendar", label: "Weekends" },
  "--calendar-unavailable": { group: "availability", label: "Closed time" },
  "--calendar-closed": { group: "availability", label: "Closed days" },
  "--calendar-busy": { group: "availability", label: "Busy" },
  "--calendar-free": { group: "availability", label: "Free" },
  "--calendar-invalid": { group: "availability", label: "Rejected change" },
  "--calendar-warning": { group: "availability", label: "Flagged change" },
  "--calendar-hour-height": {
    group: "density",
    label: "Hour height",
    range: { max: 6, min: 1.5, step: 0.25 },
  },
  "--calendar-event-padding-x": {
    group: "density",
    label: "Event padding, sides",
    range: { max: 0.75, min: 0, step: 0.0625 },
  },
  "--calendar-event-padding-y": {
    group: "density",
    label: "Event padding, top and bottom",
    range: { max: 0.5, min: 0, step: 0.0625 },
  },
  "--calendar-event": { group: "events", label: "Event fill" },
  "--calendar-event-foreground": { group: "events", label: "Event text" },
  "--calendar-event-border": { group: "events", label: "Event edge" },
};

/** The derived event tokens of `[data-color]`, by what they paint. */
export const eventColorLabels: Readonly<Record<string, string>> = {
  "--calendar-event": "Palette fill",
  "--calendar-event-foreground": "Palette text",
  "--calendar-event-border": "Palette edge",
};
