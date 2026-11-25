import type { JSX } from "@solidjs/web";
import { omit } from "solid-js";

import { cn } from "cn";

/** The React demo's shadcn label, a plain `<label>`. */
export function Label(props: JSX.LabelHTMLAttributes<HTMLLabelElement>) {
  const rest = omit(props, "class");
  return (
    <label
      data-slot="label"
      class={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        props.class as string | undefined,
      )}
      {...rest}
    />
  );
}
