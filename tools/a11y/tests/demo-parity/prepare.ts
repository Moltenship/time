/**
 * Opens the demo's week view as a link does, in the theme the frame's `?theme=` names and at the
 * instant its `?now=` names. Imported before the app, whose modules read the theme, the settings
 * and the clock as they load.
 */
import "./now";

const theme = new URLSearchParams(location.search).get("theme") === "dark" ? "dark" : "light";
localStorage.clear();
localStorage.setItem("moltenship-demo:theme", theme);
document.documentElement.classList.toggle("dark", theme === "dark");
history.replaceState(null, "", "?view=week");
