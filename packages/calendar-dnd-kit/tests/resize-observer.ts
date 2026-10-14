// jsdom has no ResizeObserver, which @dnd-kit/dom 0.5 reads as it loads (fixed in its 0.5.1 beta).
globalThis.ResizeObserver ??= class {
  disconnect() {}
  observe() {}
  unobserve() {}
};
