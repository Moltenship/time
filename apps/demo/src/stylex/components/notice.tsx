import * as stylex from "@stylexjs/stylex";

const large = "@media (min-width: 1024px)";
const rise = stylex.keyframes({
  from: { opacity: 0, translate: "0 0.5rem" },
});

const styles = stylex.create({
  message: {
    animationDuration: "150ms",
    animationName: rise,
    animationTimingFunction: "ease",
    backgroundColor: "var(--foreground)",
    borderRadius: "var(--radius)",
    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
    color: "var(--background)",
    fontSize: "0.875rem",
    lineHeight: "calc(1.25 / 0.875)",
    paddingBlock: "0.625rem",
    paddingInline: "1rem",
  },
  region: {
    bottom: { default: "10rem", [large]: "5rem" },
    display: "flex",
    insetInline: 0,
    justifyContent: "center",
    paddingInline: "1rem",
    pointerEvents: "none",
    position: "fixed",
    zIndex: 50,
  },
});

/**
 * A polite live region, mounted up front so screen readers announce each message. It sits above
 * the undo toast, so both can show.
 */
export function Notice({ text }: { readonly text: string | null }) {
  return (
    <div aria-live="polite" role="status" {...stylex.props(styles.region)}>
      {text !== null && <p {...stylex.props(styles.message)}>{text}</p>}
    </div>
  );
}
