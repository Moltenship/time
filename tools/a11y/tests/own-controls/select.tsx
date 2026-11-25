// An app's own select in place of the kit's `select.tsx`, as "Use your own controls" in the theming
// docs describes: the file keeps the kit's names and props and renders the app's select, here
// shadcn's stock one, which is built on Base UI and not on ui-sdk. `data-own-control` lets the test
// see that the trigger and the list came from here.
import type {
  SelectContentProps,
  SelectGroupProps,
  SelectItemProps,
  SelectProps,
  SelectTriggerProps,
  SelectValueProps,
} from "@registry/calendar-ui/select";
import {
  Select as AppSelect,
  SelectContent as AppSelectContent,
  SelectGroup as AppSelectGroup,
  SelectItem as AppSelectItem,
  SelectLabel as AppSelectLabel,
  SelectSeparator as AppSelectSeparator,
  SelectTrigger as AppSelectTrigger,
  SelectValue as AppSelectValue,
} from "@/components/ui/select";

export function Select<TValue extends string = string>({
  items,
  onValueChange,
  ...props
}: SelectProps<TValue>) {
  return (
    <AppSelect<TValue>
      items={items}
      onValueChange={(value) => {
        if (value !== null) onValueChange?.(value);
      }}
      {...props}
    />
  );
}

export function SelectTrigger(props: SelectTriggerProps) {
  return <AppSelectTrigger data-own-control="" {...props} />;
}

export function SelectValue(props: SelectValueProps) {
  return <AppSelectValue {...props} />;
}

export function SelectContent(props: SelectContentProps) {
  return <AppSelectContent data-own-control="" {...props} />;
}

export function SelectGroup(props: SelectGroupProps) {
  return <AppSelectGroup {...props} />;
}

export function SelectGroupLabel(props: SelectGroupProps) {
  return <AppSelectLabel {...props} />;
}

export function SelectItem(props: SelectItemProps) {
  return <AppSelectItem {...props} />;
}

export function SelectSeparator(props: { readonly className?: string }) {
  return <AppSelectSeparator {...props} />;
}
