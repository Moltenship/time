// The Theming page's switch for the dark theme.

// #region toggle
import { createSignal, onCleanup } from "solid-js";

import { Button } from "@/components/calendar/ui/button";

/** Switches the theme: the tokens' dark values apply under an element with the `dark` class. */
export function ThemeToggle() {
  const root = document.documentElement;
  const [dark, setDark] = createSignal(root.classList.contains("dark"));
  // Other code may change the class too, such as a setting elsewhere in the app, so follow it.
  const observer = new MutationObserver(() => setDark(root.classList.contains("dark")));
  observer.observe(root, { attributeFilter: ["class"] });
  onCleanup(() => observer.disconnect());
  const toggle = () => root.classList.toggle("dark", !dark());
  return (
    <Button aria-pressed={dark() ? "true" : "false"} onClick={toggle} variant="outline">
      Dark theme
    </Button>
  );
}
// #endregion toggle
