import type { JSX } from "@solidjs/web";
import { omit } from "solid-js";

import { badgeVariants, type BadgeVariants } from "@registry/shared/calendar-ui/badge.styles";
import { cn } from "cn";

/**
 * What the views pass a badge: a `<span>`'s props and shadcn's `variant`. The views set their own
 * `data-slot` and `data-state` on it, so a badge of the app's own spreads its props onto its root
 * (see "Use your own controls" in the Solid docs).
 */
export interface BadgeProps extends JSX.HTMLAttributes<HTMLSpanElement>, BadgeVariants {}

/** A small label. It has no behaviour, so it is a plain element in the kit's look. */
function Badge(props: BadgeProps) {
  const rest = omit(props, "class", "variant");
  return (
    <span
      data-slot="badge"
      data-variant={props.variant ?? "default"}
      class={cn(badgeVariants({ variant: props.variant }), props.class)}
      {...rest}
    />
  );
}

export { Badge, badgeVariants };
