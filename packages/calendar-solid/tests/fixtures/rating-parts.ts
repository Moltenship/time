import type { StateOf } from "@ui-sdk/core";
import {
  createParts,
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "@ui-sdk/solid/primitive";
import { omit, untrack } from "solid-js";

import { splitOptions } from "../../src/props";
import { rating, type RatingOptions } from "./rating";

export const { Root: Rating, Star: RatingStar } = createParts(rating, {
  root: "div",
  star: "button",
});

export type RatingHandle = PrimitiveHandle<typeof rating>;

export type RatingRootProps = RatingOptions &
  Omit<PartProps<"div", StateOf<typeof rating, "root">>, "defaultValue"> & {
    readonly onHandle?: (handle: RatingHandle) => void;
  };

// A root written by hand, as a calendar root will be: its own instance, its options from props.
export function RatingRoot(props: RatingRootProps) {
  const [options, rest] = splitOptions(props, ["value", "defaultValue", "onValueChange"]);
  const handle = usePrimitive(rating, options);
  untrack(() => props.onHandle)?.(handle);
  return usePart(handle, "root", undefined, omit(rest, "onHandle"), "div");
}
