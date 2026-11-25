import * as stylex from "@stylexjs/stylex";

const base = stylex.create({
  badge: {
    alignItems: "center",
    borderColor: "transparent",
    borderRadius: "calc(var(--radius) * 2.6)",
    borderStyle: "solid",
    borderWidth: 1,
    boxSizing: "border-box",
    display: "inline-flex",
    flexShrink: 0,
    fontSize: "0.75rem",
    fontWeight: 500,
    gap: "0.25rem",
    height: "1.25rem",
    justifyContent: "center",
    lineHeight: "calc(1 / 0.75)",
    overflow: "hidden",
    paddingBlock: "0.125rem",
    paddingInline: "0.5rem",
    transitionDuration: "150ms",
    transitionProperty: "all",
    transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
    whiteSpace: "nowrap",
    width: "fit-content",
  },
});

const variants = stylex.create({
  default: { backgroundColor: "var(--primary)", color: "var(--primary-foreground)" },
  secondary: { backgroundColor: "var(--secondary)", color: "var(--secondary-foreground)" },
  destructive: {
    backgroundColor:
      "light-dark(color-mix(in oklch, var(--destructive) 10%, transparent), color-mix(in oklch, var(--destructive) 20%, transparent))",
    color: "var(--destructive)",
  },
  outline: { borderColor: "var(--border)", color: "var(--foreground)" },
});

export type BadgeVariant = keyof typeof variants;

export interface BadgeVariants {
  readonly variant?: BadgeVariant | null;
}

/** The kit's badge styles: a small label with no behaviour of its own. */
export function badgeVariants({ variant }: BadgeVariants = {}) {
  return [base.badge, variants[variant ?? "default"]] as const;
}
