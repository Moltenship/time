/** The gap between a popover and its trigger. */
export const popoverDefaults = { sideOffset: 4 } as const;

/**
 * The panel. It shows in the browser's top layer, so it needs no `z-index`, and it clears the
 * browser's own popover border, padding and background. It fades and grows out of its trigger,
 * without the growth when motion is reduced.
 */
export const popoverContentClassName =
  "m-0 flex w-72 origin-(--transform-origin) flex-col gap-2.5 rounded-lg border-0 bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden transition-[opacity,scale,translate] duration-100 ease-out data-starting-style:opacity-0 data-ending-style:opacity-0 motion-safe:data-starting-style:scale-95 motion-safe:data-ending-style:scale-95 motion-safe:data-[side=bottom]:data-starting-style:-translate-y-2 motion-safe:data-[side=left]:data-starting-style:translate-x-2 motion-safe:data-[side=right]:data-starting-style:-translate-x-2 motion-safe:data-[side=top]:data-starting-style:translate-y-2";

export const popoverTitleClassName = "m-0 text-sm font-medium";
