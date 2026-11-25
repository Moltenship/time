import { server } from "vite-plus/test/browser";

/** Whether the run is in WebKit, which skips the tests #181 tracks. */
export const inWebKit = server.browser === "webkit";

/**
 * Tab and Shift+Tab as a keyboard user presses them to reach every control. WebKit, like Safari
 * unless "Press Tab to highlight each item on a webpage" is on, skips buttons and links on Tab alone
 * and reaches them with Option.
 */
export const tab = inWebKit ? "{Alt>}{Tab}{/Alt}" : "{Tab}";
export const shiftTab = inWebKit ? "{Shift>}{Alt>}{Tab}{/Alt}{/Shift}" : "{Shift>}{Tab}{/Shift}";
