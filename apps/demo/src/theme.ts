import { useCallback, useEffect, useState } from "react";

import { readStorage, writeStorage } from "./storage";

type Theme = "light" | "dark";

// Shared with the pre-paint script in index.html.
const themeStorageKey = "moltenship-demo:theme";
const darkQuery = "(prefers-color-scheme: dark)";

/** Follows the system theme until the user picks one; the choice is applied as `.dark` on `<html>`. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light",
  );

  useEffect(() => {
    const query = matchMedia(darkQuery);
    const followSystem = () => {
      if (readStorage(themeStorageKey) === null) setTheme(query.matches ? "dark" : "light");
    };
    query.addEventListener("change", followSystem);
    return () => query.removeEventListener("change", followSystem);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const toggleTheme = useCallback(() => {
    const next = theme === "dark" ? "light" : "dark";
    writeStorage(themeStorageKey, next);
    setTheme(next);
  }, [theme]);

  return { theme, toggleTheme };
}
