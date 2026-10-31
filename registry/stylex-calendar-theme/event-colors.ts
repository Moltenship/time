/** Named event colours styled by `[data-color]` in `calendar-theme.css`. */
export const calendarEventColors = [
  "blue",
  "green",
  "red",
  "orange",
  "yellow",
  "purple",
  "pink",
  "teal",
  "gray",
] as const;

export type CalendarEventColor = (typeof calendarEventColors)[number];
