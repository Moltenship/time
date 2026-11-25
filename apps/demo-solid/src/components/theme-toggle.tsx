import { Button } from "@registry/calendar-ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@registry/calendar-ui/tooltip";
import { Show } from "solid-js";

import { MoonIcon, SunIcon } from "../icons";
import { useTheme } from "../persisted";

export function ThemeToggle(props: { readonly class?: string }) {
  const { theme, toggleTheme } = useTheme();
  const label = () => (theme() === "dark" ? "Switch to light theme" : "Switch to dark theme");
  return (
    <Tooltip>
      <TooltipTrigger
        render={(trigger) => (
          <Button
            {...trigger}
            aria-label={label()}
            class={props.class}
            onClick={toggleTheme}
            size="icon"
            variant="ghost"
          />
        )}
      >
        <Show when={theme() === "dark"} fallback={<MoonIcon />}>
          <SunIcon />
        </Show>
      </TooltipTrigger>
      <TooltipContent>{label()}</TooltipContent>
    </Tooltip>
  );
}
