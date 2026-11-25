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
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import type { ReactNode } from "react";

import { selectStyles } from "@registry/shared/stylex-calendar-ui/select.styles";
import { type XStyle, xprops } from "@registry/stylex-calendar-theme/xprops";

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
  /** Styles after the trigger's own. */
  readonly xstyle?: XStyle;
}

/** The button that opens the list, with a chevron after the value. */
function SelectTrigger({
  children,
  className,
  size = "default",
  xstyle,
  ...props
}: SelectTriggerProps) {
  return (
    <SelectTriggerPart
      data-size={size}
      {...props}
      {...xprops(
        { className },
        selectStyles.trigger,
        size === "sm" ? selectStyles.triggerSm : selectStyles.triggerDefault,
        xstyle,
      )}
    >
      {children}
      <ChevronDownIcon aria-hidden {...xprops({}, selectStyles.icon)} />
    </SelectTriggerPart>
  );
}

export interface SelectValueProps {
  readonly className?: string;
  /** What the trigger shows while nothing is chosen. */
  readonly placeholder?: string;
  /** Styles after the value's own. */
  readonly xstyle?: XStyle;
}

/** The chosen option's label, from `items`. */
function SelectValue({ className, xstyle, ...props }: SelectValueProps) {
  return <SelectValuePart {...props} {...xprops({ className }, selectStyles.value, xstyle)} />;
}

export interface SelectContentProps {
  readonly align?: "center" | "end" | "start";
  /** Whether the list opens with the chosen option over the trigger, as a native select's does. */
  readonly alignItemWithTrigger?: boolean;
  readonly children?: ReactNode;
  readonly className?: string;
  readonly side?: "bottom" | "top";
  readonly sideOffset?: number;
  /** Styles after the list's own. */
  readonly xstyle?: XStyle;
}

/** The list, below the trigger unless `alignItemWithTrigger` puts the chosen item over it. */
function SelectContent({
  alignItemWithTrigger = true,
  className,
  sideOffset = 4,
  xstyle,
  ...props
}: SelectContentProps) {
  return (
    <SelectContentPart
      alignItemWithTrigger={alignItemWithTrigger}
      data-align-trigger={alignItemWithTrigger}
      sideOffset={sideOffset}
      {...props}
      {...xprops({ className }, selectStyles.content, xstyle)}
    />
  );
}

export interface SelectGroupProps {
  readonly children?: ReactNode;
  readonly className?: string;
  /** Styles after the part's own. */
  readonly xstyle?: XStyle;
}

function SelectGroup({ className, xstyle, ...props }: SelectGroupProps) {
  return <SelectGroupPart {...props} {...xprops({ className }, selectStyles.group, xstyle)} />;
}

function SelectGroupLabel({ className, xstyle, ...props }: SelectGroupProps) {
  return (
    <SelectGroupLabelPart {...props} {...xprops({ className }, selectStyles.groupLabel, xstyle)} />
  );
}

export interface SelectItemProps {
  readonly children?: ReactNode;
  readonly className?: string;
  /** Styles after the option's own. */
  readonly xstyle?: XStyle;
  readonly disabled?: boolean;
  /** What typing matches and the trigger shows, when the children hold more than the label. */
  readonly label?: string;
  readonly value: string;
}

/** An option, with a check at its end while it is chosen. */
function SelectItem({ children, className, xstyle, ...props }: SelectItemProps) {
  return (
    <SelectItemPart {...props} {...xprops({ className }, selectStyles.item, xstyle)}>
      <span {...xprops({}, selectStyles.itemText)}>{children}</span>
      <SelectItemIndicator {...xprops({}, selectStyles.itemIndicator)}>
        <CheckIcon aria-hidden {...xprops({}, selectStyles.itemIndicatorIcon)} />
      </SelectItemIndicator>
    </SelectItemPart>
  );
}

function SelectSeparator({
  className,
  xstyle,
}: {
  readonly className?: string;
  readonly xstyle?: XStyle;
}) {
  return <SelectSeparatorPart {...xprops({ className }, selectStyles.separator, xstyle)} />;
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
