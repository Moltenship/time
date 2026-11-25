import type { JSX } from "@solidjs/web";
import { Button as ButtonPart } from "@ui-sdk/solid/button";
import type { RenderProp } from "@ui-sdk/solid/primitive";
import { omit } from "solid-js";

import { buttonVariants, type ButtonVariants } from "@registry/shared/calendar-ui/button.styles";
import { cn } from "cn";

/**
 * What the views pass a button. It's the props of a `<button>` with shadcn's names for the look, so
 * an app can make this file render its own button instead (see "Use your own controls" in the
 * Solid docs).
 */
export interface ButtonProps
  extends
    Omit<
      JSX.ButtonHTMLAttributes<HTMLButtonElement>,
      "class" | "disabled" | "onClick" | "style" | "type"
    >,
    ButtonVariants {
  readonly class?: string;
  readonly disabled?: boolean;
  readonly style?: JSX.CSSProperties | string;
  readonly type?: "button" | "reset" | "submit";
  readonly onClick?: JSX.EventHandler<HTMLElement, MouseEvent>;
  /**
   * Renders an element in place of the `<button>`, such as one of the calendar's triggers: a
   * function of the props to spread on it. It gets the button's props and look, and keeps its own.
   */
  readonly render?: RenderProp;
}

/** ui-sdk's button in the kit's look. */
function Button(props: ButtonProps) {
  const rest = omit(props, "class", "size", "variant");
  return (
    <ButtonPart
      class={cn(buttonVariants({ size: props.size, variant: props.variant }), props.class)}
      {...rest}
    />
  );
}

export { Button, buttonVariants };
