import * as stylex from "@stylexjs/stylex";
import type { CompiledStyles } from "@stylexjs/stylex/lib/types/StyleXTypes";
import type { CSSProperties } from "react";

/**
 * One argument of `stylex.props`. `stylex.StyleXStyles` is stricter: it rejects the conditional
 * values and custom properties the calendar's styles use.
 */
export type XStyle = stylex.StyleXArray<CompiledStyles | boolean | null | undefined>;

/** `stylex.props`, merged with a `className` and `style` the component was passed. */
export function xprops(
  own: { readonly className?: string | undefined; readonly style?: CSSProperties | undefined },
  ...styles: readonly XStyle[]
) {
  const props = stylex.props(...styles);
  const className = [props.className, own.className].filter(Boolean).join(" ");
  const style = own.style === undefined ? props.style : { ...props.style, ...own.style };
  return { ...props, className: className === "" ? undefined : className, style };
}
