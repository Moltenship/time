import * as stylex from "@stylexjs/stylex";

import { calendarVars } from "@registry/stylex-calendar-theme/calendar-tokens.stylex";
import { eventColorStyles } from "@registry/stylex-calendar-theme/event-color-styles";
import type { CalendarEventColor } from "@registry/stylex-calendar-theme/event-colors";

const styles = stylex.create({
  swatch: {
    backgroundColor: calendarVars["--calendar-event-border"],
    borderRadius: "9999px",
    display: "inline-block",
    flexShrink: 0,
    height: "0.75rem",
    width: "0.75rem",
  },
});

/** A calendar's colour, beside its name. */
export function Swatch({
  color,
  xstyle,
}: {
  readonly color: CalendarEventColor | undefined;
  readonly xstyle?: stylex.StyleXStyles;
}) {
  return (
    <span
      data-color={color}
      {...stylex.props(styles.swatch, color !== undefined && eventColorStyles[color], xstyle)}
    />
  );
}
