import { MoonIcon, SunIcon } from "lucide-react";

import type { XStyle } from "@registry/stylex-calendar-theme/xprops";
import { Button } from "@registry/stylex-calendar-ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@registry/stylex-calendar-ui/tooltip";

import { useTheme } from "../../use-theme";

export function ThemeToggle({ xstyle }: { readonly xstyle?: XStyle }) {
  const { theme, toggleTheme } = useTheme();
  const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            onClick={toggleTheme}
            size="icon"
            variant="ghost"
            xstyle={xstyle}
          />
        }
      >
        {theme === "dark" ? <SunIcon aria-hidden /> : <MoonIcon aria-hidden />}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
