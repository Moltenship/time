/**
 * Makes the next press on `element` leave focus where it was, as a click on a button does in
 * Safari. Chromium, and WebKit on Linux, focus a clicked button; WebKit on macOS doesn't.
 */
export function pressWithoutFocus(element: HTMLElement) {
  element.addEventListener("mousedown", (down) => down.preventDefault(), { once: true });
}
