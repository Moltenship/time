import type { JSX } from "@solidjs/web";
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
} from "@ui-sdk/solid/select";
import { omit } from "solid-js";

import { CheckIcon, ChevronDownIcon } from "@registry/calendar-ui/icons";
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
import { cn } from "cn";

/** An option as `items` lists it: what the trigger shows, and the value it stands for. */
export interface SelectItemData<TValue extends string = string> {
  readonly label: string;
  readonly value: TValue;
}

/**
 * What the views pass a select. The names are shadcn's and Base UI's, so an app can make this file
 * render its own select instead (see "Use your own controls" in the Solid docs).
 */
export interface SelectProps<TValue extends string = string> {
  readonly children?: JSX.Element;
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
function Select<TValue extends string = string>(props: SelectProps<TValue>) {
  const rest = omit(props, "children", "items", "onValueChange");
  return (
    <SelectRoot<TValue>
      items={props.items === undefined ? undefined : [...props.items]}
      onValueChange={(value) => {
        if (value !== null) props.onValueChange?.(value);
      }}
      {...rest}
    >
      {props.children}
    </SelectRoot>
  );
}

export interface SelectTriggerProps {
  readonly "aria-label"?: string;
  readonly "aria-labelledby"?: string;
  readonly children?: JSX.Element;
  readonly class?: string;
  readonly id?: string;
  readonly size?: "default" | "sm";
}

/** The button that opens the list, with a chevron after the value. */
function SelectTrigger(props: SelectTriggerProps) {
  const rest = omit(props, "children", "class", "size");
  return (
    <SelectTriggerPart
      data-size={props.size ?? "default"}
      class={cn(selectTriggerClassName, props.class)}
      {...rest}
    >
      {props.children}
      <ChevronDownIcon aria-hidden="true" class={selectIconClassName} />
    </SelectTriggerPart>
  );
}

export interface SelectValueProps {
  readonly class?: string;
  /** What the trigger shows while nothing is chosen. */
  readonly placeholder?: string;
}

/** The chosen option's label, from `items`. */
function SelectValue(props: SelectValueProps) {
  const rest = omit(props, "class");
  return <SelectValuePart class={cn(selectValueClassName, props.class)} {...rest} />;
}

export interface SelectContentProps {
  readonly align?: "center" | "end" | "start";
  /** Whether the list opens with the chosen option over the trigger, as a native select's does. */
  readonly alignItemWithTrigger?: boolean;
  readonly children?: JSX.Element;
  readonly class?: string;
  readonly side?: "bottom" | "top";
  readonly sideOffset?: number;
}

/** The list, below the trigger unless `alignItemWithTrigger` puts the chosen item over it. */
function SelectContent(props: SelectContentProps) {
  const aligned = () => props.alignItemWithTrigger ?? selectDefaults.alignItemWithTrigger;
  const rest = omit(props, "alignItemWithTrigger", "class", "sideOffset");
  return (
    <SelectContentPart
      alignItemWithTrigger={aligned()}
      data-align-trigger={String(aligned())}
      class={cn(selectContentClassName, props.class)}
      sideOffset={props.sideOffset ?? selectDefaults.sideOffset}
      {...rest}
    />
  );
}

export interface SelectGroupProps {
  readonly children?: JSX.Element;
  readonly class?: string;
}

function SelectGroup(props: SelectGroupProps) {
  const rest = omit(props, "class");
  return <SelectGroupPart class={cn(selectGroupClassName, props.class)} {...rest} />;
}

function SelectGroupLabel(props: SelectGroupProps) {
  const rest = omit(props, "class");
  return <SelectGroupLabelPart class={cn(selectGroupLabelClassName, props.class)} {...rest} />;
}

export interface SelectItemProps {
  readonly children?: JSX.Element;
  readonly class?: string;
  readonly disabled?: boolean;
  /** What typing matches and the trigger shows, when the children hold more than the label. */
  readonly label?: string;
  readonly value: string;
}

/** An option, with a check at its end while it is chosen. */
function SelectItem(props: SelectItemProps) {
  const rest = omit(props, "children", "class");
  return (
    <SelectItemPart class={cn(selectItemClassName, props.class)} {...rest}>
      <span class={selectItemTextClassName}>{props.children}</span>
      <SelectItemIndicator class={selectItemIndicatorClassName}>
        <CheckIcon aria-hidden="true" />
      </SelectItemIndicator>
    </SelectItemPart>
  );
}

function SelectSeparator(props: { readonly class?: string }) {
  return <SelectSeparatorPart class={cn(selectSeparatorClassName, props.class)} />;
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
