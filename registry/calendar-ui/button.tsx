import { Button as ButtonPart } from "@ui-sdk/react/button";
import { cn } from "cn";
import type { ComponentProps } from "react";

import { buttonVariants, type ButtonVariants } from "@registry/shared/calendar-ui/button.styles";

export interface ButtonProps
  extends Omit<ComponentProps<typeof ButtonPart>, "className">, ButtonVariants {
  readonly className?: string;
}

/** ui-sdk's button in the kit's look. `render` makes it a link or another part's element. */
function Button({ className, size, variant, ...props }: ButtonProps) {
  return <ButtonPart className={cn(buttonVariants({ size, variant }), className)} {...props} />;
}

export { Button, buttonVariants };
