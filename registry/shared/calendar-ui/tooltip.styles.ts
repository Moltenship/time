/** How long the pointer rests on a trigger before its tooltip opens, and the gap to the trigger. */
export const tooltipDefaults = { delay: 400, sideOffset: 4 } as const;

/**
 * The tooltip's bubble. It fades and grows out of its trigger, without the growth when motion is
 * reduced, and opens at once when it follows another tooltip (`data-instant`).
 */
export const tooltipContentClassName =
  "inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 overflow-visible rounded-md bg-foreground px-3 py-1.5 text-xs text-background transition-[opacity,scale,translate] duration-150 ease-out data-starting-style:opacity-0 data-ending-style:opacity-0 motion-safe:data-starting-style:scale-95 motion-safe:data-ending-style:scale-95 motion-safe:data-[side=bottom]:data-starting-style:-translate-y-2 motion-safe:data-[side=left]:data-starting-style:translate-x-2 motion-safe:data-[side=right]:data-starting-style:-translate-x-2 motion-safe:data-[side=top]:data-starting-style:translate-y-2 data-instant:transition-none";

/** The arrow, a turned square half under the bubble on the side facing the trigger. */
export const tooltipArrowClassName =
  "absolute size-2.5 rotate-45 rounded-[2px] bg-foreground data-[side=bottom]:-top-1 data-[side=bottom]:left-[calc(var(--arrow-offset)-0.3125rem)] data-[side=left]:-right-1 data-[side=left]:top-[calc(var(--arrow-offset)-0.3125rem)] data-[side=right]:-left-1 data-[side=right]:top-[calc(var(--arrow-offset)-0.3125rem)] data-[side=top]:-bottom-1 data-[side=top]:left-[calc(var(--arrow-offset)-0.3125rem)]";
