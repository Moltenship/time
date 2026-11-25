import * as stylex from "@stylexjs/stylex";

/** What the sidebar's sections share. */
export const sectionStyles = stylex.create({
  heading: {
    fontSize: "0.875rem",
    fontWeight: 500,
    lineHeight: "calc(1.25 / 0.875)",
    paddingBottom: "0.25rem",
    paddingInline: "0.5rem",
  },
  // A row of the calendar and activity lists: its checkbox, an icon and its name.
  row: {
    backgroundColor: { default: null, ":hover": "var(--accent)" },
    borderRadius: "calc(var(--radius) * 0.8)",
    cursor: "pointer",
    fontWeight: 400,
    gap: "0.75rem",
    height: "2rem",
    paddingInline: "0.5rem",
  },
});
