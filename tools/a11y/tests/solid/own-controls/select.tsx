// An app's own select in place of the kit's `select.tsx`, as "Use your own controls" in the Solid
// docs describes: the file keeps the kit's names and props and renders a native `<select>`, with
// no ui-sdk. The trigger is the `<select>`, with an option for each of `items`, so the list's own
// parts draw nothing. `data-own-control` lets the test see that the select came from here.
import { createContext, For, useContext } from "solid-js";

import type {
  SelectContentProps,
  SelectGroupProps,
  SelectItemProps,
  SelectProps,
  SelectTriggerProps,
  SelectValueProps,
} from "@registry/calendar-ui/select";

const SelectContext = createContext<SelectProps>({});

export function Select<TValue extends string = string>(props: SelectProps<TValue>) {
  return <SelectContext value={props as unknown as SelectProps}>{props.children}</SelectContext>;
}

export function SelectTrigger(props: SelectTriggerProps) {
  const select = useContext(SelectContext);
  return (
    <select
      aria-label={props["aria-label"]}
      aria-labelledby={props["aria-labelledby"]}
      class={`h-8 rounded-md border bg-background px-2 text-sm ${props.class ?? ""}`}
      data-own-control=""
      disabled={select.disabled}
      id={props.id}
      name={select.name}
      onChange={(event) => select.onValueChange?.(event.currentTarget.value)}
      value={select.value ?? select.defaultValue}
    >
      <For each={select.items ?? []}>
        {(item) => <option value={item.value}>{item.label}</option>}
      </For>
    </select>
  );
}

export function SelectValue(_props: SelectValueProps) {
  return null;
}

export function SelectContent(_props: SelectContentProps) {
  return null;
}

export function SelectGroup(_props: SelectGroupProps) {
  return null;
}

export function SelectGroupLabel(_props: SelectGroupProps) {
  return null;
}

export function SelectItem(_props: SelectItemProps) {
  return null;
}

export function SelectSeparator(_props: { readonly class?: string }) {
  return null;
}
