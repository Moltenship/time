// The Theming page's switch for the dark theme.

// #region toggle
import { createSignal } from "solid-js";

import { Button } from "@/components/calendar/ui/button";

/** Switches the theme: the tokens' dark values apply under an element with the `dark` class. */
export function ThemeToggle() {
  const root = document.documentElement;
  const [dark, setDark] = createSignal(root.classList.contains("dark"));
  const toggle = () => {
    const next = !dark();
    root.classList.toggle("dark", next);
    setDark(next);
  };
  return (
    <Button aria-pressed={dark() ? "true" : "false"} onClick={toggle} variant="outline">
      Dark theme
    </Button>
  );
}
// #endregion toggle
