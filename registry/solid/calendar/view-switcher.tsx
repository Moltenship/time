import { For, Show } from "solid-js";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@registry/calendar-ui/select";
import {
  viewSwitcherShortcutClass,
  viewSwitcherTriggerClass,
} from "@registry/shared/calendar/calendar-toolbar.styles";
import { viewSwitcherLabel } from "@registry/shared/calendar/navigation-labels";
import { cn } from "cn";

export interface ViewSwitcherOption<TView extends string> {
  readonly label: string;
  /** Keyboard shortcut shown next to the label in the list. */
  readonly shortcut?: string;
  readonly value: TView;
}

export interface ViewSwitcherProps<TView extends string> {
  readonly class?: string;
  readonly onValueChange: (view: TView) => void;
  readonly options: readonly ViewSwitcherOption<TView>[];
  readonly value: TView;
}

export function ViewSwitcher<TView extends string>(props: ViewSwitcherProps<TView>) {
  return (
    <Select
      items={props.options}
      value={props.value}
      onValueChange={(next) => {
        const option = props.options.find((candidate) => candidate.value === next);
        if (option !== undefined) props.onValueChange(option.value);
      }}
    >
      <SelectTrigger
        aria-label={viewSwitcherLabel}
        class={cn(viewSwitcherTriggerClass, props.class)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end" alignItemWithTrigger={false}>
        <SelectGroup>
          <For each={props.options} keyed={(option) => option.value}>
            {(option) => (
              <SelectItem label={option().label} value={option().value}>
                {option().label}
                {/* The trigger and typing read `label`, so the shortcut only appears in the list. */}
                <Show when={option().shortcut}>
                  {(shortcut) => <kbd class={viewSwitcherShortcutClass}>{shortcut()}</kbd>}
                </Show>
              </SelectItem>
            )}
          </For>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
