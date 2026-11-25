import * as stylex from "@stylexjs/stylex";
import { Input as InputPart } from "@ui-sdk/react/input";
import { Label as LabelPart } from "@ui-sdk/react/label";
import { Textarea as TextareaPart } from "@ui-sdk/react/textarea";
import type { ComponentProps } from "react";

import { type XStyle, xprops } from "@registry/stylex-calendar-theme/xprops";

const medium = "@media (min-width: 768px)";
const focusRing = "0 0 0 3px color-mix(in oklch, var(--ring) 50%, transparent)";
const invalidRing =
  "0 0 0 3px light-dark(color-mix(in oklch, var(--destructive) 20%, transparent), color-mix(in oklch, var(--destructive) 40%, transparent))";

/** shadcn's input and textarea, the main demo's, in StyleX. */
const styles = stylex.create({
  field: {
    backgroundColor: {
      default: "light-dark(transparent, color-mix(in oklch, var(--input) 30%, transparent))",
      ":disabled":
        "light-dark(color-mix(in oklch, var(--input) 50%, transparent), color-mix(in oklch, var(--input) 80%, transparent))",
    },
    borderColor: {
      default: "var(--input)",
      ":focus-visible": "var(--ring)",
      "[aria-invalid=true]":
        "light-dark(var(--destructive), color-mix(in oklch, var(--destructive) 50%, transparent))",
    },
    borderRadius: "var(--radius)",
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: { default: null, ":focus-visible": focusRing, "[aria-invalid=true]": invalidRing },
    cursor: { default: null, ":disabled": "not-allowed" },
    fontSize: { default: "1rem", [medium]: "0.875rem" },
    lineHeight: { default: 1.5, [medium]: "calc(1.25 / 0.875)" },
    minWidth: 0,
    opacity: { default: null, ":disabled": 0.5 },
    outlineStyle: "none",
    paddingInline: "0.625rem",
    transitionDuration: "150ms",
    transitionProperty:
      "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke",
    transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
    width: "100%",
  },
  input: {
    height: "2rem",
    paddingBlock: "0.25rem",
    pointerEvents: { default: null, ":disabled": "none" },
  },
  textarea: {
    display: "flex",
    minHeight: "4rem",
    paddingBlock: "0.5rem",
  },
  label: {
    alignItems: "center",
    display: "flex",
    fontSize: "0.875rem",
    fontWeight: 500,
    gap: "0.5rem",
    lineHeight: 1,
    userSelect: "none",
  },
});

export interface InputProps extends Omit<ComponentProps<typeof InputPart>, "className" | "style"> {
  readonly xstyle?: XStyle;
}

export function Input({ xstyle, ...props }: InputProps) {
  return <InputPart {...props} {...xprops({}, styles.field, styles.input, xstyle)} />;
}

export interface TextareaProps extends Omit<
  ComponentProps<typeof TextareaPart>,
  "className" | "style"
> {
  readonly xstyle?: XStyle;
}

/** Grows with its text, as shadcn's `field-sizing: content` does, up to the max height it's given. */
export function Textarea({ xstyle, ...props }: TextareaProps) {
  return (
    <TextareaPart autoResize {...props} {...xprops({}, styles.field, styles.textarea, xstyle)} />
  );
}

export interface LabelProps extends Omit<ComponentProps<typeof LabelPart>, "className" | "style"> {
  readonly xstyle?: XStyle;
}

export function Label({ xstyle, ...props }: LabelProps) {
  return <LabelPart {...props} {...xprops({}, styles.label, xstyle)} />;
}
