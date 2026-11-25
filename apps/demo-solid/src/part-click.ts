/**
 * A click handler for an element a part's `render` spreads its props on. A handler written after
 * the spread replaces the part's, so a tooltip trigger's press no longer closed its tooltip, which
 * stayed open over the dialog the press opened. This runs `own`, then the part's handler, as
 * ui-sdk runs a part's after yours, unless `own` prevents the default.
 */
export function withPartClick(part: object, own: (event: MouseEvent) => void) {
  return (event: MouseEvent) => {
    own(event);
    if (event.defaultPrevented) return;
    const handler = (part as { readonly onClick?: unknown }).onClick;
    // A function, or Solid's bound form, `[handler, data]`.
    if (typeof handler === "function") (handler as (event: MouseEvent) => void)(event);
    else if (Array.isArray(handler)) {
      (handler[0] as (data: unknown, event: MouseEvent) => void)(handler[1], event);
    }
  };
}
