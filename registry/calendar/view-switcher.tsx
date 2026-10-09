import { cn } from "cn";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@registry/ui/select";

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
      <SelectTrigger aria-label="View" className={cn("rounded-full sm:w-26", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end" alignItemWithTrigger={false}>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
              {/* The trigger shows the label from `items`, so the shortcut only appears in the list. */}
              {option.shortcut !== undefined && (
                <kbd className="ml-auto font-sans text-xs text-muted-foreground">
                  {option.shortcut}
                </kbd>
              )}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
