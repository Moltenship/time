import { createComponent, dynamic } from "@solidjs/web";
import { createParts } from "@ui-sdk/solid/primitive";

import { rating } from "./rating";

const { Root, Star } = createParts(rating, { root: "div", star: "button" });
const Section = dynamic(() => "section", { static: true });

export function RatingApp(props: { readonly defaultValue?: number }) {
  return createComponent(Section, {
    "data-testid": "app",
    get children() {
      return createComponent(Root, {
        get defaultValue() {
          return props.defaultValue;
        },
        "aria-label": "Rating",
        get children() {
          return ["1", "2", "3"].map((v) =>
            createComponent(Star, { value: v, "aria-label": `${v} stars`, children: "★" }),
          );
        },
      });
    },
  });
}
