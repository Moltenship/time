import { cn } from "@registry/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@registry/ui/select";

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
      value={value}
      onValueChange={(next) => {
        const option = options.find((candidate) => candidate.value === next);
        if (option !== undefined) onValueChange(option.value);
      }}
    >
      <SelectTrigger aria-label="View" size="sm" className={cn("rounded-full sm:w-26", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {options.map((option) => (
          <SelectItem
            key={option.value}
            hint={option.shortcut && <kbd className="font-sans">{option.shortcut}</kbd>}
            value={option.value}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
