import { afterEach } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import "./styles.css";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// The demo's page declares its language; axe checks the test page the same way.
document.documentElement.lang = "en";

// The mouse stays where a test leaves it, over whatever the next test renders there, which it
// would hover. Each test ends with the mouse parked on a corner of its own, above the page.
const corner = document.createElement("div");
corner.setAttribute("aria-hidden", "true");
corner.style.cssText =
  "position: fixed; top: 0; left: 0; z-index: 2147483647; width: 1px; height: 1px";
document.body.append(corner);
afterEach(async () => {
  await userEvent.hover(corner);
});
