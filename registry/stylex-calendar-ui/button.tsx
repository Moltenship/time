import { Button as ButtonPart } from "@ui-sdk/react/button";
import type { ComponentProps, MouseEventHandler, ReactElement } from "react";

import {
  buttonVariants,
  type ButtonVariants,
} from "@registry/shared/stylex-calendar-ui/button.styles";
import { type XStyle, xprops } from "@registry/stylex-calendar-theme/xprops";

/**
 * What the views pass a button. It's the props of a `<button>` with shadcn's names for the look and
 * StyleX styles in `xstyle`, so an app can make this file render its own button instead (see "Use
 * your own controls" in the theming docs).
 */
export interface ButtonProps
  extends Omit<ComponentProps<"button">, "className" | "onClick">, ButtonVariants {
  readonly className?: string;
  readonly onClick?: MouseEventHandler<HTMLElement>;
  /**
   * An element to render in place of the `<button>`, such as one of the calendar's triggers. It
   * gets the button's props and look, and keeps its own.
   */
  readonly render?: ReactElement;
  /** Styles after the button's own. */
  readonly xstyle?: XStyle;
}

/** ui-sdk's button in the kit's look. */
function Button({ className, size, style, variant, xstyle, ...props }: ButtonProps) {
  return (
    <ButtonPart
      {...props}
      {...xprops({ className, style }, buttonVariants({ size, variant }), xstyle)}
    />
  );
}

export { Button, buttonVariants };
