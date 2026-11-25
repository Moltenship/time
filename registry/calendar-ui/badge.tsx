import { cn } from "cn";
import type { ComponentProps } from "react";

import { badgeVariants, type BadgeVariants } from "@registry/shared/calendar-ui/badge.styles";

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
