import * as stylex from "@stylexjs/stylex";

import { calendarVars } from "@registry/stylex-calendar-theme/calendar-tokens.stylex";

/**
 * Points the three event tokens at one colour, so an element and what's inside it only ever read
 * `--calendar-event*`. Set beside `data-color`, which stays the hook for an app's own CSS.
 */
export const eventColorStyles = stylex.create({
  blue: {
    "--calendar-event": calendarVars["--calendar-event-blue"],
    "--calendar-event-foreground": calendarVars["--calendar-event-blue-foreground"],
    "--calendar-event-border": calendarVars["--calendar-event-blue-border"],
  },
  green: {
    "--calendar-event": calendarVars["--calendar-event-green"],
    "--calendar-event-foreground": calendarVars["--calendar-event-green-foreground"],
    "--calendar-event-border": calendarVars["--calendar-event-green-border"],
  },
  red: {
    "--calendar-event": calendarVars["--calendar-event-red"],
    "--calendar-event-foreground": calendarVars["--calendar-event-red-foreground"],
    "--calendar-event-border": calendarVars["--calendar-event-red-border"],
  },
  orange: {
    "--calendar-event": calendarVars["--calendar-event-orange"],
    "--calendar-event-foreground": calendarVars["--calendar-event-orange-foreground"],
    "--calendar-event-border": calendarVars["--calendar-event-orange-border"],
  },
  yellow: {
    "--calendar-event": calendarVars["--calendar-event-yellow"],
    "--calendar-event-foreground": calendarVars["--calendar-event-yellow-foreground"],
    "--calendar-event-border": calendarVars["--calendar-event-yellow-border"],
  },
  purple: {
    "--calendar-event": calendarVars["--calendar-event-purple"],
    "--calendar-event-foreground": calendarVars["--calendar-event-purple-foreground"],
    "--calendar-event-border": calendarVars["--calendar-event-purple-border"],
  },
  pink: {
    "--calendar-event": calendarVars["--calendar-event-pink"],
    "--calendar-event-foreground": calendarVars["--calendar-event-pink-foreground"],
    "--calendar-event-border": calendarVars["--calendar-event-pink-border"],
  },
  teal: {
    "--calendar-event": calendarVars["--calendar-event-teal"],
    "--calendar-event-foreground": calendarVars["--calendar-event-teal-foreground"],
    "--calendar-event-border": calendarVars["--calendar-event-teal-border"],
  },
  gray: {
    "--calendar-event": calendarVars["--calendar-event-gray"],
    "--calendar-event-foreground": calendarVars["--calendar-event-gray-foreground"],
    "--calendar-event-border": calendarVars["--calendar-event-gray-border"],
  },
});
