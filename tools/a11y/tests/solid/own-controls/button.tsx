// An app's own button in place of the kit's `button.tsx`, as "Use your own controls" in the Solid
// docs describes: the file keeps the kit's name and props and renders a plain `<button>`, with no
// ui-sdk. `data-own-control` lets the test see that every button came from here.
import { merge, omit } from "solid-js";

import type { ButtonProps } from "@registry/calendar-ui/button";

export type { ButtonProps };

const looks = {
  default: "bg-primary text-primary-foreground",
  ghost: "hover:bg-muted",
  outline: "border bg-background",
} as const;

export function Button(props: ButtonProps) {
  const own = merge(omit(props, "class", "render", "size", "variant"), {
    get class() {
      const look =
        looks[props.variant === "ghost" || props.variant === "outline" ? props.variant : "default"];
      return `inline-flex min-h-8 min-w-8 items-center justify-center gap-1 rounded-md px-2 ${look} ${props.class ?? ""}`;
    },
    "data-own-control": "",
    get type() {
      return props.type ?? "button";
    },
  });
  // A trigger the view renders through the button gets the button's props, as the kit's does.
  return props.render === undefined ? <button {...own} /> : props.render(own, {});
}
