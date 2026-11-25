import {
  Tooltip as TooltipRoot,
  TooltipArrow,
  TooltipContent as TooltipContentPart,
  TooltipTrigger as TooltipTriggerPart,
} from "@ui-sdk/react/tooltip";
import { cn } from "cn";
import type { ReactElement, ReactNode } from "react";

import {
  tooltipArrowClassName,
  tooltipContentClassName,
  tooltipDefaults,
} from "@registry/shared/calendar-ui/tooltip.styles";

export interface TooltipProps {
  readonly children?: ReactNode;
  /** How long, in milliseconds, the pointer rests on the trigger before the tooltip opens. */
  readonly delay?: number;
}

/**
 * A tooltip that names its trigger, as an icon button's does: a screen reader reads its text once,
 * as the trigger's name. Tooltips group on their own: once one is open, the next opens at once.
 */
function Tooltip({ children, delay = tooltipDefaults.delay }: TooltipProps) {
  return (
    <TooltipRoot delay={delay} type="label">
      {children}
    </TooltipRoot>
  );
}

export interface TooltipTriggerProps {
  readonly children?: ReactNode;
  readonly className?: string;
  /** The element that shows the tooltip, such as a `Button`, in place of a plain `<button>`. */
  readonly render?: ReactElement;
}

function TooltipTrigger(props: TooltipTriggerProps) {
  return <TooltipTriggerPart {...props} />;
}

export interface TooltipContentProps {
  readonly align?: "center" | "end" | "start";
  readonly children?: ReactNode;
  readonly className?: string;
  readonly side?: "bottom" | "left" | "right" | "top";
  readonly sideOffset?: number;
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
