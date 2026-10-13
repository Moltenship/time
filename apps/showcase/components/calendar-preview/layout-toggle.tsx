import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import type { OverlapLayout } from "@moltenship/calendar";
import { useId, type ReactNode } from "react";

export const overlapLayouts = [
  { label: "Columns", value: "columns" },
  { label: "Equal", value: "equal" },
  { label: "Stack", value: "stack" },
] as const satisfies readonly { readonly label: string; readonly value: OverlapLayout }[];

/** A labelled pill of toggles that picks one of `options`. */
export function ChoiceToggle<TValue extends string>({
  label,
  onChange,
  options,
  value,
}: {
  readonly label: ReactNode;
  readonly onChange: (value: TValue) => void;
  readonly options: readonly { readonly label: string; readonly value: TValue }[];
  readonly value: TValue;
}) {
  const labelId = useId();
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm" id={labelId}>
        {label}
      </span>
      <ToggleGroup
        aria-labelledby={labelId}
        className="flex gap-1 rounded-full bg-fd-muted p-1"
        onValueChange={([next]) => {
          if (next !== undefined) onChange(next as TValue);
        }}
        value={[value]}
      >
        {options.map((option) => (
          <Toggle
            key={option.value}
            className="rounded-full px-3 py-1 text-sm text-fd-foreground transition-colors outline-none hover:bg-fd-background/60 focus-visible:ring-2 focus-visible:ring-fd-ring data-pressed:bg-fd-background data-pressed:font-medium data-pressed:shadow-sm"
            value={option.value}
          >
            {option.label}
          </Toggle>
        ))}
      </ToggleGroup>
    </div>
  );
}
