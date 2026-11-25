import {
  Tooltip as TooltipRoot,
  TooltipArrow,
  TooltipContent as TooltipContentPart,
  TooltipTrigger,
} from "@ui-sdk/react/tooltip";
import { cn } from "cn";
import type { ComponentProps, ReactNode } from "react";

import {
  tooltipArrowClassName,
  tooltipContentClassName,
  tooltipDefaults,
} from "@registry/shared/calendar-ui/tooltip.styles";

/** Tooltips group on their own: once one is open, the next opens at once. */
function Tooltip({ delay = tooltipDefaults.delay, ...props }: ComponentProps<typeof TooltipRoot>) {
  return <TooltipRoot delay={delay} {...props} />;
}

export interface TooltipContentProps extends Omit<
  ComponentProps<typeof TooltipContentPart>,
  "children" | "className"
> {
  readonly children?: ReactNode;
  readonly className?: string;
}

/** The hint, in the browser's top layer, with an arrow towards its trigger. */
function TooltipContent({
  children,
  className,
  sideOffset = tooltipDefaults.sideOffset,
  ...props
}: TooltipContentProps) {
  return (
    <TooltipContentPart
      className={cn(tooltipContentClassName, className)}
      sideOffset={sideOffset}
      {...props}
    >
      {children}
      <TooltipArrow className={tooltipArrowClassName} />
    </TooltipContentPart>
  );
}

export { Tooltip, TooltipContent, TooltipTrigger };
