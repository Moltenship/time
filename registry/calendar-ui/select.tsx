import {
  Select,
  SelectContent as SelectContentPart,
  SelectGroup as SelectGroupPart,
  SelectGroupLabel as SelectGroupLabelPart,
  SelectItem as SelectItemPart,
  SelectItemIndicator,
  SelectSeparator as SelectSeparatorPart,
  SelectTrigger as SelectTriggerPart,
  SelectValue as SelectValuePart,
} from "@ui-sdk/react/select";
import { cn } from "cn";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import {
  selectContentClassName,
  selectGroupClassName,
  selectGroupLabelClassName,
  selectIconClassName,
  selectItemClassName,
  selectItemIndicatorClassName,
  selectItemTextClassName,
  selectSeparatorClassName,
  selectTriggerClassName,
  selectValueClassName,
} from "@registry/shared/calendar-ui/select.styles";

/** A part's props with plain class names and content, as the kit's parts take them. */
type KitProps<T> = Omit<T, "children" | "className"> & {
  readonly children?: ReactNode;
  readonly className?: string;
};

export interface SelectTriggerProps extends KitProps<ComponentProps<typeof SelectTriggerPart>> {
  readonly size?: "default" | "sm";
}

/** The button that opens the list, with a chevron after the value. */
function SelectTrigger({ children, className, size = "default", ...props }: SelectTriggerProps) {
  return (
    <SelectTriggerPart
      data-size={size}
      className={cn(selectTriggerClassName, className)}
      {...props}
    >
      {children}
      <ChevronDownIcon aria-hidden className={selectIconClassName} />
    </SelectTriggerPart>
  );
}

function SelectValue({ className, ...props }: KitProps<ComponentProps<typeof SelectValuePart>>) {
  return <SelectValuePart className={cn(selectValueClassName, className)} {...props} />;
}

/** The list, below the trigger unless `alignItemWithTrigger` puts the chosen item over it. */
function SelectContent({
  alignItemWithTrigger = true,
  className,
  sideOffset = 4,
  ...props
}: KitProps<ComponentProps<typeof SelectContentPart>>) {
  return (
    <SelectContentPart
      alignItemWithTrigger={alignItemWithTrigger}
      data-align-trigger={alignItemWithTrigger}
      className={cn(selectContentClassName, className)}
      sideOffset={sideOffset}
      {...props}
    />
  );
}

function SelectGroup({ className, ...props }: KitProps<ComponentProps<typeof SelectGroupPart>>) {
  return <SelectGroupPart className={cn(selectGroupClassName, className)} {...props} />;
}

function SelectGroupLabel({
  className,
  ...props
}: KitProps<ComponentProps<typeof SelectGroupLabelPart>>) {
  return <SelectGroupLabelPart className={cn(selectGroupLabelClassName, className)} {...props} />;
}

/** An option, with a check at its end while it is chosen. */
function SelectItem({
  children,
  className,
  ...props
}: KitProps<ComponentProps<typeof SelectItemPart>>) {
  return (
    <SelectItemPart className={cn(selectItemClassName, className)} {...props}>
      <span className={selectItemTextClassName}>{children}</span>
      <SelectItemIndicator className={selectItemIndicatorClassName}>
        <CheckIcon aria-hidden />
      </SelectItemIndicator>
    </SelectItemPart>
  );
}

function SelectSeparator({
  className,
  ...props
}: KitProps<ComponentProps<typeof SelectSeparatorPart>>) {
  return <SelectSeparatorPart className={cn(selectSeparatorClassName, className)} {...props} />;
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
