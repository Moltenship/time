/** The dimmed page behind a dialog, which fades in and out with it. */
export const dialogBackdropClassName =
  "fixed inset-0 z-50 bg-black/10 transition-opacity duration-100 ease-out supports-backdrop-filter:backdrop-blur-xs data-starting-style:opacity-0 data-ending-style:opacity-0";

/**
 * The dialog, centred in the browser's top layer, where it needs no `z-index`. It clears the
 * browser's own popover border and padding, and fades and grows in, without the growth when motion
 * is reduced.
 */
export const dialogContentClassName =
  "fixed inset-0 m-auto grid h-fit max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-2rem)] gap-4 overflow-y-auto rounded-xl border-0 bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 outline-none transition-[opacity,scale] duration-100 ease-out sm:max-w-sm data-starting-style:opacity-0 data-ending-style:opacity-0 motion-safe:data-starting-style:scale-95 motion-safe:data-ending-style:scale-95";

export const dialogHeaderClassName = "flex flex-col gap-2";

export const dialogFooterClassName =
  "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end";

export const dialogTitleClassName = "m-0 font-heading text-base leading-none font-medium";

export const dialogDescriptionClassName = "m-0 text-sm text-muted-foreground";
