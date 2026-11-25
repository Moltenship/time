/** The select's parts, by `data-slot`: the trigger, the value in it and its chevron. */
export const selectTriggerClassName =
  "flex w-fit items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 ps-2.5 pe-2 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-disabled:cursor-not-allowed data-disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

export const selectValueClassName = "flex flex-1 text-start";

export const selectIconClassName = "pointer-events-none size-4 text-muted-foreground";

/**
 * The list. It shows in the browser's top layer, so it needs no `z-index`, and it clears the
 * browser's own popover border, padding and background. It fades and grows in, without the growth
 * when motion is reduced or when it opens over the trigger.
 */
export const selectContentClassName =
  "m-0 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg border-0 bg-popover p-0 text-popover-foreground shadow-md ring-1 ring-foreground/10 transition-[opacity,scale,translate] duration-100 ease-out data-starting-style:opacity-0 data-ending-style:opacity-0 motion-safe:not-data-[align-trigger=true]:data-starting-style:scale-95 motion-safe:not-data-[align-trigger=true]:data-ending-style:scale-95 motion-safe:data-[side=bottom]:data-starting-style:-translate-y-2 motion-safe:data-[side=top]:data-starting-style:translate-y-2";

export const selectGroupClassName = "scroll-my-1 p-1";

export const selectGroupLabelClassName = "px-1.5 py-1 text-xs text-muted-foreground";

/** An option. `data-highlighted` marks the one the keyboard or the pointer is on. */
export const selectItemClassName =
  "relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 ps-1.5 pe-8 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

export const selectItemTextClassName = "flex flex-1 shrink-0 gap-2 whitespace-nowrap";

export const selectItemIndicatorClassName =
  "pointer-events-none absolute end-2 flex size-4 items-center justify-center";

export const selectSeparatorClassName = "pointer-events-none -mx-1 my-1 h-px bg-border";
