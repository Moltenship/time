import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { MoonIcon, SunIcon } from "lucide-react";

import { useTheme } from "../../theme";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";

  return (
    <IconButton
      icon={<Icon icon={theme === "dark" ? SunIcon : MoonIcon} />}
      label={label}
      onClick={toggleTheme}
      tooltip={label}
      variant="ghost"
    />
  );
}
