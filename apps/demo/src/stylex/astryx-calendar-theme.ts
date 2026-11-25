import * as stylex from "@stylexjs/stylex";

import { calendarVars } from "@registry/stylex-calendar-theme/calendar-tokens.stylex";

/** The Astryx theme's colours and radius, as the calendar's base tokens. */
export const astryxCalendarTheme = stylex.createTheme(calendarVars, {
  "--radius": "var(--radius-element)",
  "--background": "var(--color-background-surface)",
  "--foreground": "var(--color-text-primary)",
  "--card": "var(--color-background-card)",
  "--card-foreground": "var(--color-text-primary)",
  "--popover": "var(--color-background-popover)",
  "--popover-foreground": "var(--color-text-primary)",
  "--primary": "var(--color-accent)",
  "--primary-foreground": "var(--color-on-accent)",
  "--secondary": "var(--color-background-muted)",
  "--secondary-foreground": "var(--color-text-primary)",
  "--muted": "var(--color-background-muted)",
  "--muted-foreground": "var(--color-text-secondary)",
  "--accent": "var(--color-background-muted)",
  "--accent-foreground": "var(--color-text-primary)",
  "--destructive": "var(--color-error)",
  "--border": "var(--color-border)",
  "--input": "var(--color-border-emphasized)",
  "--ring": "var(--focus-outline-color)",
});
