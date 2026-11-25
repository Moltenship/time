// "Use your own controls" on the Controls page: an app's own `components/calendar/ui/button.tsx`,
// in place of the kit's. The check below the region keeps it in step with the props the views pass.

// #region button
import type { JSX } from "@solidjs/web";
import { merge, omit } from "solid-js";

export interface ButtonProps extends Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "class"> {
  readonly class?: string;
  readonly size?: "default" | "icon" | "icon-sm" | "icon-xs" | "lg" | "sm" | "xs";
  readonly variant?: "default" | "ghost" | "outline";
  /** Renders a calendar trigger in place of the `<button>`, with the props to spread on it. */
  readonly render?: (props: Record<string, unknown>, state: object) => JSX.Element;
}

const looks = {
  default: "bg-primary text-primary-foreground",
  ghost: "hover:bg-muted",
  outline: "border bg-background",
};

export function Button(props: ButtonProps) {
  const own = merge(omit(props, "class", "render", "size", "variant"), {
    get class() {
      return `inline-flex min-h-8 items-center gap-1 rounded-md px-2 ${looks[props.variant ?? "default"]} ${props.class ?? ""}`;
    },
    get type() {
      return props.type ?? "button";
    },
  });
  return props.render === undefined ? <button {...own} /> : props.render(own, {});
}
// #endregion button

import type { ButtonProps as KitButtonProps } from "@/components/calendar/ui/button";

/**
 * Fails to compile when the kit's button takes a prop this file doesn't. The kit has more sizes and
 * variants than the views use, so those two are left to the page's table.
 */
export const takesTheKitsProps = (props: Omit<KitButtonProps, "size" | "variant">): ButtonProps =>
  props;
