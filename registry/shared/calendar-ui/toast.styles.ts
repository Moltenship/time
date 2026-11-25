/**
 * The region, at the bottom centre of the screen. It shows in the browser's top layer and clears
 * the browser's own popover border, padding and background. ui-sdk centres it with `left: 50%`
 * and a `-50%` translate; the margins centre it here, so the translate goes.
 */
export const toastRegionClassName =
  "fixed inset-x-0 top-auto bottom-6 mx-auto translate-none my-0 h-fit w-fit max-w-[calc(100vw-2rem)] overflow-visible rounded-xl border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-ring [&>ol]:m-0 [&>ol]:flex [&>ol]:list-none [&>ol]:flex-col [&>ol]:items-center [&>ol]:p-0";

/** A toast, in the page's foreground colour. It fades in and out, and rises unless motion is reduced. */
export const toastClassName =
  "flex items-center gap-1 rounded-lg bg-foreground py-1.5 ps-4 pe-1.5 text-sm text-background shadow-lg outline-none transition-[opacity,translate] duration-200 focus-visible:ring-2 focus-visible:ring-ring data-ending-style:opacity-0 data-starting-style:opacity-0 motion-safe:data-ending-style:translate-y-2 motion-safe:data-starting-style:translate-y-2";

export const toastTitleClassName = "me-2 min-w-0 truncate";

export const toastDescriptionClassName = "text-background/80";

export const toastActionClassName =
  "h-8 rounded-md px-3 font-semibold outline-none hover:bg-background/15 focus-visible:ring-2 focus-visible:ring-background/60";

export const toastCloseClassName =
  "grid size-8 place-items-center rounded-md text-background/70 outline-none hover:bg-background/15 hover:text-background focus-visible:ring-2 focus-visible:ring-background/60 [&_svg]:size-4";
