import type { JSX } from "@solidjs/web";
import { Checkbox as CheckboxPart, CheckboxIndicator } from "@ui-sdk/solid/checkbox";
import { omit } from "solid-js";

import { cn } from "cn";

import { CheckIcon } from "../icons";

// The React demo's shadcn checkbox (apps/demo/src/components/ui/checkbox.tsx), class for class,
// on ui-sdk's, which sets the same `data-checked` and `data-disabled`. shadcn's is a span: it takes
// its row's cursor and alignment, not a button's.

export interface CheckboxProps {
  readonly "aria-label"?: string;
  readonly checked: boolean;
  readonly class?: string;
  readonly "data-color"?: string;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly ref?: (element: HTMLElement) => void;
  readonly style?: JSX.CSSProperties;
}

export function Checkbox(props: CheckboxProps) {
  const rest = omit(props, "class", "onCheckedChange");
  return (
    <CheckboxPart
      class={cn(
        "peer relative flex cursor-[inherit] [text-align:inherit] size-4 shrink-0 items-center justify-center rounded-[4px] border border-input transition-colors outline-none group-has-disabled/field:opacity-50 group-has-[:focus-visible]/field-label:ring-0 group-has-[:focus-visible]/field-label:not-data-checked:border-input after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground group-has-[:focus-visible]/field-label:data-checked:border-primary dark:data-checked:bg-primary",
        props.class,
      )}
      onCheckedChange={(checked) => props.onCheckedChange(checked === true)}
      {...rest}
    >
      <CheckboxIndicator class="grid place-content-center text-current transition-none [&>svg]:size-3.5">
        <CheckIcon />
      </CheckboxIndicator>
    </CheckboxPart>
  );
}
