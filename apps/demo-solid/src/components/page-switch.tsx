import { buttonVariants } from "@registry/calendar-ui/button";
import { cn } from "cn";
import { For } from "solid-js";

import { demoFrameworks, frameworkHref } from "@demo/ui-switch";

/**
 * React, the React demo's Tailwind page, and Solid, this page, as a group of links, as in the React
 * demo's top bar. Each reads the URL as it's followed, which keeps the view and the date.
 */
export function FrameworkSwitch(props: { readonly class?: string }) {
  return (
    <div
      aria-label="Framework"
      class={cn("flex shrink-0 items-center rounded-full border p-0.5", props.class)}
      role="group"
    >
      <For each={demoFrameworks}>
        {(option) => (
          <a
            aria-current={option.value === "solid" ? "page" : undefined}
            class={cn(
              buttonVariants({
                size: "sm",
                variant: option.value === "solid" ? "secondary" : "ghost",
              }),
              "h-7 rounded-full",
            )}
            href={frameworkHref(option.value)}
            onClick={(click) => {
              click.currentTarget.href = frameworkHref(option.value);
            }}
          >
            {option.label}
          </a>
        )}
      </For>
    </div>
  );
}
