/** The sides a popup takes; `inline-start` and `inline-end` follow the writing direction. */
export type PopupSide = "bottom" | "inline-end" | "inline-start" | "left" | "right" | "top";

/** A side in ui-sdk's names, where the writing direction's sides are `start` and `end`. */
export function popupSide(side: PopupSide | undefined) {
  return side === "inline-end" ? "end" : side === "inline-start" ? "start" : side;
}
