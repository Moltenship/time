import { useSyncExternalStore } from "react";

import { readTheme, subscribeTheme, toggleTheme } from "./theme";

/** Follows the system theme until the user picks one; the choice is saved and applied as `.dark`. */
export function useTheme() {
  return { theme: useSyncExternalStore(subscribeTheme, readTheme), toggleTheme };
}
