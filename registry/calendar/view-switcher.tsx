"use client";

import { cn } from "cn";
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

export interface ViewSwitcherOption<TView extends string> {
  readonly label: string;
  /** Keyboard shortcut shown next to the label in the list. */
  readonly shortcut?: string;
  readonly value: TView;
}

export interface ViewSwitcherProps<TView extends string> {
  readonly className?: string;
  readonly onValueChange: (view: TView) => void;
  readonly options: readonly ViewSwitcherOption<TView>[];
  readonly value: TView;
}

export function ViewSwitcher<TView extends string>({
  className,
  onValueChange,
  options,
  value,
}: ViewSwitcherProps<TView>) {
  return (
    <Select
      items={options}
      value={value}
      onValueChange={(next) => {
        const option = options.find((candidate) => candidate.value === next);
        if (option !== undefined) onValueChange(option.value);
      }}
    >
      <SelectTrigger
        aria-label={viewSwitcherLabel}
        className={cn(viewSwitcherTriggerClass, className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end" alignItemWithTrigger={false}>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} label={option.label} value={option.value}>
              {option.label}
              {/* The trigger and typing read `label`, so the shortcut only appears in the list. */}
              {option.shortcut !== undefined && (
                <kbd className={viewSwitcherShortcutClass}>{option.shortcut}</kbd>
              )}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
