"use client";

import {
  Select as SelectRoot,
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
import type { ReactNode } from "react";

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
  selectDefaults,
} from "@registry/shared/calendar-ui/select.styles";

/** An option as `items` lists it: what the trigger shows, and the value it stands for. */
export interface SelectItemData<TValue extends string = string> {
  readonly label: string;
  readonly value: TValue;
}

/**
 * What the views pass a select. The names are shadcn's and Base UI's, so an app can make this file
 * render its own select instead (see "Use your own controls" in the theming docs).
 */
export interface SelectProps<TValue extends string = string> {
  readonly children?: ReactNode;
  readonly defaultValue?: TValue;
  readonly disabled?: boolean;
  /** Every option, so the trigger shows the chosen one's label before the list first opens. */
  readonly items?: readonly SelectItemData<TValue>[];
  readonly name?: string;
  /** The chosen value. A select with a value never clears it, so this never hears `null`. */
  readonly onValueChange?: (value: TValue) => void;
  readonly value?: TValue;
}

/** One value from a list in a popup. Typing on the trigger picks the option whose label matches. */
function Select<TValue extends string = string>({
  children,
  items,
  onValueChange,
  ...props
}: SelectProps<TValue>) {
  return (
    <SelectRoot<TValue>
      items={items === undefined ? undefined : [...items]}
      onValueChange={(value) => {
        if (value !== null) onValueChange?.(value);
      }}
      {...props}
    >
      {children}
    </SelectRoot>
  );
}

export interface SelectTriggerProps {
  readonly "aria-label"?: string;
  readonly "aria-labelledby"?: string;
  readonly children?: ReactNode;
  readonly className?: string;
  readonly id?: string;
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

export interface SelectValueProps {
  readonly className?: string;
  /** What the trigger shows while nothing is chosen. */
  readonly placeholder?: string;
}

/** The chosen option's label, from `items`. */
function SelectValue({ className, ...props }: SelectValueProps) {
  return <SelectValuePart className={cn(selectValueClassName, className)} {...props} />;
}

export interface SelectContentProps {
  readonly align?: "center" | "end" | "start";
  /** Whether the list opens with the chosen option over the trigger, as a native select's does. */
  readonly alignItemWithTrigger?: boolean;
  readonly children?: ReactNode;
  readonly className?: string;
  readonly side?: "bottom" | "top";
  readonly sideOffset?: number;
}

/** The list, below the trigger unless `alignItemWithTrigger` puts the chosen item over it. */
function SelectContent({
  alignItemWithTrigger = selectDefaults.alignItemWithTrigger,
  className,
  sideOffset = selectDefaults.sideOffset,
  ...props
}: SelectContentProps) {
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

export interface SelectGroupProps {
  readonly children?: ReactNode;
  readonly className?: string;
}

function SelectGroup({ className, ...props }: SelectGroupProps) {
  return <SelectGroupPart className={cn(selectGroupClassName, className)} {...props} />;
}

function SelectGroupLabel({ className, ...props }: SelectGroupProps) {
  return <SelectGroupLabelPart className={cn(selectGroupLabelClassName, className)} {...props} />;
}

export interface SelectItemProps {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly disabled?: boolean;
  /** What typing matches and the trigger shows, when the children hold more than the label. */
  readonly label?: string;
  readonly value: string;
}

/** An option, with a check at its end while it is chosen. */
function SelectItem({ children, className, ...props }: SelectItemProps) {
  return (
    <SelectItemPart className={cn(selectItemClassName, className)} {...props}>
      <span className={selectItemTextClassName}>{children}</span>
      <SelectItemIndicator className={selectItemIndicatorClassName}>
        <CheckIcon aria-hidden />
      </SelectItemIndicator>
    </SelectItemPart>
  );
}

function SelectSeparator({ className }: { readonly className?: string }) {
  return <SelectSeparatorPart className={cn(selectSeparatorClassName, className)} />;
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
