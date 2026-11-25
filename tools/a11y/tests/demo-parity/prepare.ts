/**
 * Opens the demo's week view as a link does, in the theme the frame's `?theme=` names. Imported
 * before the app, whose modules read the theme and the settings as they load.
 */
const theme = new URLSearchParams(location.search).get("theme") === "dark" ? "dark" : "light";
localStorage.clear();
localStorage.setItem("moltenship-demo:theme", theme);
document.documentElement.classList.toggle("dark", theme === "dark");
history.replaceState(null, "", "?view=week");
