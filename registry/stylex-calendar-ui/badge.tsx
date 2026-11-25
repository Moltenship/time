import type { ComponentProps } from "react";

import {
  badgeVariants,
  type BadgeVariants,
} from "@registry/shared/stylex-calendar-ui/badge.styles";
import { type XStyle, xprops } from "@registry/stylex-calendar-theme/xprops";

/**
 * What the views pass a badge: a `<span>`'s props, shadcn's `variant` and StyleX styles in
 * `xstyle`. The views set their own `data-slot` and `data-state` on it, so a badge of the app's
 * own spreads its props onto its root (see "Use your own controls" in the theming docs).
 */
export interface BadgeProps extends ComponentProps<"span">, BadgeVariants {
  /** Styles after the badge's own. */
  readonly xstyle?: XStyle;
}

/** A small label. It has no behaviour, so it is a plain element in the kit's look. */
function Badge({ className, style, variant, xstyle, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      data-variant={variant ?? "default"}
      {...props}
      {...xprops({ className, style }, badgeVariants({ variant }), xstyle)}
    />
  );
}

export { Badge, badgeVariants };
