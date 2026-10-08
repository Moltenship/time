import { MoonIcon, SunIcon } from "lucide-react";

import { Button } from "@registry/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@registry/ui/tooltip";

import { useTheme } from "../theme";

export function ThemeToggle({ className }: { readonly className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            className={className}
            onClick={toggleTheme}
            size="icon"
            variant="ghost"
          />
        }
      >
        {theme === "dark" ? <SunIcon /> : <MoonIcon />}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
