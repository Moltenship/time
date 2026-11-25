import * as stylex from "@stylexjs/stylex";

const focusRing = "0 0 0 3px color-mix(in oklch, var(--ring) 50%, transparent)";

/** The kit's button: the part's own look, before its variant and size. */
const base = stylex.create({
  button: {
    alignItems: "center",
    appearance: "none",
    backgroundClip: "padding-box",
    borderRadius: "var(--radius)",
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: { default: null, ":focus-visible": focusRing },
    boxSizing: "border-box",
    cursor: { default: "pointer", "[data-pending]": "wait" },
    display: "inline-flex",
    flexShrink: 0,
    fontFamily: "inherit",
    fontSize: "0.875rem",
    fontWeight: 500,
    justifyContent: "center",
    lineHeight: "calc(1.25 / 0.875)",
    marginBlock: 0,
    marginInline: 0,
    opacity: { default: null, ":disabled": 0.5, "[data-disabled]": 0.5 },
    outlineStyle: "none",
    paddingBlock: 0,
    pointerEvents: { default: null, ":disabled": "none", "[data-disabled]": "none" },
    textDecoration: "none",
    transitionDuration: "150ms",
    transitionProperty: "all",
    transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
    translate: { default: null, ":active:not([aria-haspopup])": "0 1px" },
    userSelect: "none",
    whiteSpace: "nowrap",
  },
});

/** Each variant's colours, as shadcn names them. Dark surfaces get their own through `light-dark()`. */
const variants = stylex.create({
  default: {
    backgroundColor: {
      default: "var(--primary)",
      ":hover": "color-mix(in oklch, var(--primary) 80%, transparent)",
    },
    borderColor: { default: "transparent", ":focus-visible": "var(--ring)" },
    color: "var(--primary-foreground)",
  },
  outline: {
    backgroundColor: {
      default: "light-dark(var(--background), color-mix(in oklch, var(--input) 30%, transparent))",
      ":hover": "light-dark(var(--muted), color-mix(in oklch, var(--input) 50%, transparent))",
      "[aria-expanded=true]": "var(--muted)",
    },
    borderColor: {
      default: "light-dark(var(--border), var(--input))",
      ":focus-visible": "var(--ring)",
    },
    color: {
      default: "inherit",
      ":hover": "var(--foreground)",
      "[aria-expanded=true]": "var(--foreground)",
    },
  },
  secondary: {
    backgroundColor: {
      default: "var(--secondary)",
      ":hover": "color-mix(in oklch, var(--secondary), var(--foreground) 5%)",
    },
    borderColor: { default: "transparent", ":focus-visible": "var(--ring)" },
    color: "var(--secondary-foreground)",
  },
  ghost: {
    backgroundColor: {
      default: "transparent",
      ":hover": "light-dark(var(--muted), color-mix(in oklch, var(--muted) 50%, transparent))",
      "[aria-expanded=true]": "var(--muted)",
    },
    borderColor: { default: "transparent", ":focus-visible": "var(--ring)" },
    color: {
      default: "inherit",
      ":hover": "var(--foreground)",
      "[aria-expanded=true]": "var(--foreground)",
    },
  },
  destructive: {
    backgroundColor: {
      default:
        "light-dark(color-mix(in oklch, var(--destructive) 10%, transparent), color-mix(in oklch, var(--destructive) 20%, transparent))",
      ":hover":
        "light-dark(color-mix(in oklch, var(--destructive) 20%, transparent), color-mix(in oklch, var(--destructive) 30%, transparent))",
    },
    borderColor: {
      default: "transparent",
      ":focus-visible": "color-mix(in oklch, var(--destructive) 40%, transparent)",
    },
    boxShadow: {
      default: null,
      ":focus-visible":
        "0 0 0 3px light-dark(color-mix(in oklch, var(--destructive) 20%, transparent), color-mix(in oklch, var(--destructive) 40%, transparent))",
    },
    color: "var(--destructive)",
  },
  link: {
    backgroundColor: "transparent",
    borderColor: { default: "transparent", ":focus-visible": "var(--ring)" },
    color: "var(--primary)",
    textDecoration: { default: null, ":hover": "underline" },
    textUnderlineOffset: "4px",
  },
});

/** Each size's box. The icon sizes are squares. */
const sizes = stylex.create({
  default: { gap: "0.375rem", height: "2rem", paddingInline: "0.625rem" },
  xs: {
    borderRadius: "min(calc(var(--radius) * 0.8), 10px)",
    fontSize: "0.75rem",
    gap: "0.25rem",
    height: "1.5rem",
    lineHeight: "calc(1 / 0.75)",
    paddingInline: "0.5rem",
  },
  sm: {
    borderRadius: "min(calc(var(--radius) * 0.8), 12px)",
    fontSize: "0.8rem",
    gap: "0.25rem",
    height: "1.75rem",
    paddingInline: "0.625rem",
  },
  lg: { gap: "0.375rem", height: "2.25rem", paddingInline: "0.625rem" },
  icon: { height: "2rem", paddingInline: 0, width: "2rem" },
  "icon-xs": {
    borderRadius: "min(calc(var(--radius) * 0.8), 10px)",
    height: "1.5rem",
    paddingInline: 0,
    width: "1.5rem",
  },
  "icon-sm": {
    borderRadius: "min(calc(var(--radius) * 0.8), 12px)",
    height: "1.75rem",
    paddingInline: 0,
    width: "1.75rem",
  },
  "icon-lg": { height: "2.25rem", paddingInline: 0, width: "2.25rem" },
});

export type ButtonVariant = keyof typeof variants;
export type ButtonSize = keyof typeof sizes;

export interface ButtonVariants {
  readonly size?: ButtonSize | null;
  readonly variant?: ButtonVariant | null;
}

/** The kit's button styles, for the button part and for elements that look like one. */
export function buttonVariants({ size, variant }: ButtonVariants = {}) {
  return [base.button, variants[variant ?? "default"], sizes[size ?? "default"]] as const;
}
