// jsdom has no paint timing. ui-sdk reads it before it first places a popup, such as the
// registry's view select, so a test that renders one would throw without this. The list is empty,
// as it is in a browser before the first paint.
if (typeof window !== "undefined" && typeof performance.getEntriesByType !== "function") {
  performance.getEntriesByType = () => [];
}

// Nor does it have `ResizeObserver` or Web Animations, which ui-sdk's toasts and dialogs use to
// measure themselves and to wait for their transitions. With nothing to observe and no animation
// running, they settle at once, as with reduced motion.
if (typeof window !== "undefined") {
  globalThis.ResizeObserver ??= class {
    disconnect() {}
    observe() {}
    unobserve() {}
  };
  if (typeof Element.prototype.getAnimations !== "function") {
    Element.prototype.getAnimations = () => [];
  }
}

// Nor the Popover API, though its stylesheet hides every `[popover]` that isn't `:popover-open`,
// which nothing can match without it. ui-sdk marks an open popup `data-open`, so this shows it, and
// what's inside can take focus, as in a browser. jsdom weighs its own rules by specificity alone,
// hence `!important`.
if (typeof document !== "undefined" && typeof HTMLElement.prototype.showPopover !== "function") {
  const style = document.createElement("style");
  style.textContent = "[popover][data-open] { display: block !important; }";
  document.head.append(style);
}
