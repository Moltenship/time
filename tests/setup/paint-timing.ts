// jsdom has no paint timing. ui-sdk reads it before it first places a popup, such as the
// registry's view select, so a test that renders one would throw without this. The list is empty,
// as it is in a browser before the first paint.
if (typeof window !== "undefined" && typeof performance.getEntriesByType !== "function") {
  performance.getEntriesByType = () => [];
}
