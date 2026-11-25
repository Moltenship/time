import * as stylex from "@stylexjs/stylex";
import { CalendarDaysIcon } from "lucide-react";

const styles = stylex.create({
  icon: {
    height: "1.125rem",
    width: "1.125rem",
  },
  mark: {
    backgroundColor: "var(--primary)",
    borderRadius: "var(--radius)",
    color: "var(--primary-foreground)",
    display: "grid",
    flexShrink: 0,
    height: "2rem",
    placeItems: "center",
    width: "2rem",
  },
});

export function BrandMark() {
  return (
    <span {...stylex.props(styles.mark)}>
      <CalendarDaysIcon {...stylex.props(styles.icon)} />
    </span>
  );
}
