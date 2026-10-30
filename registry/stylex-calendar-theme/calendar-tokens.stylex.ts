import * as stylex from "@stylexjs/stylex";

/**
 * The calendar's tokens as StyleX variables. They keep the names of `calendar-theme.css`, so both
 * flavours share one vocabulary: a key starting with `--` stays that custom property, unhashed.
 *
 * The base colours read the Astryx theme around the calendar, and fall back to the values of
 * `calendar-theme.css` without one. Light and dark share a value through `light-dark()`, which
 * follows `color-scheme`; `<Theme>` from `@astryxdesign/core/theme` sets it on the root.
 */
export const calendarTokenDefaults = {
  "--radius": "var(--radius-element, 0.625rem)",
  "--background": "var(--color-background-surface, light-dark(oklch(1 0 0), oklch(0.145 0 0)))",
  "--foreground": "var(--color-text-primary, light-dark(oklch(0.145 0 0), oklch(0.985 0 0)))",
  "--card": "var(--color-background-card, light-dark(oklch(1 0 0), oklch(0.205 0 0)))",
  "--card-foreground": "var(--color-text-primary, light-dark(oklch(0.145 0 0), oklch(0.985 0 0)))",
  "--popover": "var(--color-background-popover, light-dark(oklch(1 0 0), oklch(0.205 0 0)))",
  "--popover-foreground":
    "var(--color-text-primary, light-dark(oklch(0.145 0 0), oklch(0.985 0 0)))",
  "--primary": "var(--color-accent, light-dark(oklch(0.205 0 0), oklch(0.922 0 0)))",
  "--primary-foreground": "var(--color-on-accent, light-dark(oklch(0.985 0 0), oklch(0.205 0 0)))",
  "--secondary": "var(--color-background-muted, light-dark(oklch(0.97 0 0), oklch(0.269 0 0)))",
  "--secondary-foreground":
    "var(--color-text-primary, light-dark(oklch(0.205 0 0), oklch(0.985 0 0)))",
  "--muted": "var(--color-background-muted, light-dark(oklch(0.97 0 0), oklch(0.269 0 0)))",
  "--muted-foreground":
    "var(--color-text-secondary, light-dark(oklch(0.556 0 0), oklch(0.708 0 0)))",
  "--accent": "var(--color-background-muted, light-dark(oklch(0.97 0 0), oklch(0.269 0 0)))",
  "--accent-foreground":
    "var(--color-text-primary, light-dark(oklch(0.205 0 0), oklch(0.985 0 0)))",
  "--destructive":
    "var(--color-error, light-dark(oklch(0.577 0.245 27.325), oklch(0.704 0.191 22.216)))",
  "--border": "var(--color-border, light-dark(oklch(0.922 0 0), oklch(1 0 0 / 10%)))",
  "--input": "var(--color-border-emphasized, light-dark(oklch(0.922 0 0), oklch(1 0 0 / 15%)))",
  "--ring": "var(--focus-outline-color, light-dark(oklch(0.25 0 0), oklch(0.8 0 0)))",

  "--calendar-grid": "var(--border)",
  "--calendar-axis": "var(--muted-foreground)",
  // Lighter in dark than the Tailwind theme's, to stay readable on Astryx's lighter dark surface.
  "--calendar-today": "light-dark(oklch(0.52 0.215 262.9), oklch(0.73 0.15 254.6))",
  "--calendar-today-foreground": "light-dark(oklch(0.985 0 0), oklch(0.145 0 0))",
  "--calendar-now": "light-dark(oklch(0.637 0.237 25.3), oklch(0.704 0.191 22.2))",
  "--calendar-selection":
    "light-dark(color-mix(in oklch, var(--calendar-today) 12%, transparent), color-mix(in oklch, var(--calendar-today) 18%, transparent))",
  "--calendar-weekend":
    "light-dark(color-mix(in oklch, var(--muted) 60%, transparent), color-mix(in oklch, var(--muted) 35%, transparent))",
  // Time outside working hours, shaded behind events, and closed days, muted lightly enough that
  // dates and other text on them stay readable. A dark surface has little room to darken, so
  // closed time lightens instead.
  "--calendar-unavailable":
    "light-dark(color-mix(in oklch, var(--muted-foreground) 9%, transparent), color-mix(in oklch, var(--foreground) 7%, transparent))",
  "--calendar-closed":
    "light-dark(color-mix(in oklch, var(--muted-foreground) 4%, transparent), color-mix(in oklch, var(--foreground) 4%, transparent))",
  // The dot of a resource's status badge: busy with events, or free in working hours.
  "--calendar-busy": "light-dark(oklch(0.577 0.215 27.3), oklch(0.704 0.191 22.2))",
  "--calendar-free": "light-dark(oklch(0.56 0.14 150), oklch(0.74 0.16 150))",
  // A preview the policies would reject, or let through flagged, such as outside working hours.
  "--calendar-invalid": "var(--destructive)",
  "--calendar-warning": "light-dark(oklch(0.58 0.13 65), oklch(0.8 0.14 80))",
  "--calendar-hour-height": "3rem",
  // Padding inside events in time grids.
  "--calendar-event-padding-x": "0.375rem",
  "--calendar-event-padding-y": "0.25rem",
  "--calendar-event": "color-mix(in oklch, var(--primary) 8%, var(--background))",
  "--calendar-event-foreground": "var(--foreground)",
  "--calendar-event-border": "var(--primary)",

  // Each event colour's fill, text and edge, derived from its hue and chroma as in
  // `calendar-theme.css`, in light and dark. `eventColorStyles` gives an element one of them.
  "--calendar-event-blue":
    "light-dark(oklch(0.95 calc(0.17 * 0.3) 258), oklch(0.32 calc(0.17 * 0.45) 258))",
  "--calendar-event-blue-foreground":
    "light-dark(oklch(0.37 calc(0.17 * 0.8) 258), oklch(0.93 calc(0.17 * 0.35) 258))",
  "--calendar-event-blue-border": "light-dark(oklch(0.63 0.17 258), oklch(0.72 0.17 258))",
  "--calendar-event-green":
    "light-dark(oklch(0.95 calc(0.15 * 0.3) 150), oklch(0.32 calc(0.15 * 0.45) 150))",
  "--calendar-event-green-foreground":
    "light-dark(oklch(0.37 calc(0.15 * 0.8) 150), oklch(0.93 calc(0.15 * 0.35) 150))",
  "--calendar-event-green-border": "light-dark(oklch(0.63 0.15 150), oklch(0.72 0.15 150))",
  "--calendar-event-red":
    "light-dark(oklch(0.95 calc(0.19 * 0.3) 25), oklch(0.32 calc(0.19 * 0.45) 25))",
  "--calendar-event-red-foreground":
    "light-dark(oklch(0.37 calc(0.19 * 0.8) 25), oklch(0.93 calc(0.19 * 0.35) 25))",
  "--calendar-event-red-border": "light-dark(oklch(0.63 0.19 25), oklch(0.72 0.19 25))",
  "--calendar-event-orange":
    "light-dark(oklch(0.95 calc(0.17 * 0.3) 55), oklch(0.32 calc(0.17 * 0.45) 55))",
  "--calendar-event-orange-foreground":
    "light-dark(oklch(0.37 calc(0.17 * 0.8) 55), oklch(0.93 calc(0.17 * 0.35) 55))",
  "--calendar-event-orange-border": "light-dark(oklch(0.63 0.17 55), oklch(0.72 0.17 55))",
  "--calendar-event-yellow":
    "light-dark(oklch(0.95 calc(0.15 * 0.3) 90), oklch(0.32 calc(0.15 * 0.45) 90))",
  "--calendar-event-yellow-foreground":
    "light-dark(oklch(0.37 calc(0.15 * 0.8) 90), oklch(0.93 calc(0.15 * 0.35) 90))",
  "--calendar-event-yellow-border": "light-dark(oklch(0.63 0.15 90), oklch(0.72 0.15 90))",
  "--calendar-event-purple":
    "light-dark(oklch(0.95 calc(0.18 * 0.3) 300), oklch(0.32 calc(0.18 * 0.45) 300))",
  "--calendar-event-purple-foreground":
    "light-dark(oklch(0.37 calc(0.18 * 0.8) 300), oklch(0.93 calc(0.18 * 0.35) 300))",
  "--calendar-event-purple-border": "light-dark(oklch(0.63 0.18 300), oklch(0.72 0.18 300))",
  "--calendar-event-pink":
    "light-dark(oklch(0.95 calc(0.18 * 0.3) 350), oklch(0.32 calc(0.18 * 0.45) 350))",
  "--calendar-event-pink-foreground":
    "light-dark(oklch(0.37 calc(0.18 * 0.8) 350), oklch(0.93 calc(0.18 * 0.35) 350))",
  "--calendar-event-pink-border": "light-dark(oklch(0.63 0.18 350), oklch(0.72 0.18 350))",
  "--calendar-event-teal":
    "light-dark(oklch(0.95 calc(0.12 * 0.3) 190), oklch(0.32 calc(0.12 * 0.45) 190))",
  "--calendar-event-teal-foreground":
    "light-dark(oklch(0.37 calc(0.12 * 0.8) 190), oklch(0.93 calc(0.12 * 0.35) 190))",
  "--calendar-event-teal-border": "light-dark(oklch(0.63 0.12 190), oklch(0.72 0.12 190))",
  "--calendar-event-gray":
    "light-dark(oklch(0.95 calc(0.015 * 0.3) 260), oklch(0.32 calc(0.015 * 0.45) 260))",
  "--calendar-event-gray-foreground":
    "light-dark(oklch(0.37 calc(0.015 * 0.8) 260), oklch(0.93 calc(0.015 * 0.35) 260))",
  "--calendar-event-gray-border": "light-dark(oklch(0.63 0.015 260), oklch(0.72 0.015 260))",
};

export const calendarVars = stylex.defineVars(calendarTokenDefaults);

/**
 * Marks what a part's `stylex.when.ancestor()` looks at. Not `stylex.defaultMarker()`: Astryx's
 * Layout carries that one, so hovering a layout around the calendar would count for every part in it.
 */
export const calendarMarker = stylex.defineMarker();

/** The same for a view's grid, kept apart so hovering the grid isn't hovering every part in it. */
export const calendarGridMarker = stylex.defineMarker();

/**
 * What the calendar sits on, behind sticky headers and gutters and between overlapping events.
 * Unset, it is `--background` wherever it is used; a container sets `--calendar-surface` to change
 * it. A constant, not a variable, so it follows a nested theme's background.
 */
export const calendarConsts = stylex.defineConsts({
  surface: "var(--calendar-surface, var(--background))",
});
