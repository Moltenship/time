import { cn } from "cn";
import type { ComponentProps } from "react";

import { badgeVariants, type BadgeVariants } from "@registry/shared/calendar-ui/badge.styles";

/**
 * What the views pass a badge: a `<span>`'s props and shadcn's `variant`. The views set their own
 * `data-slot` and `data-state` on it, so a badge of the app's own spreads its props onto its root
 * (see "Use your own controls" in the theming docs).
 */
export interface BadgeProps extends ComponentProps<"span">, BadgeVariants {}

/** A small label. It has no behaviour, so it is a plain element in the kit's look. */
function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      data-variant={variant ?? "default"}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
