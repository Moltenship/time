import * as stylex from "@stylexjs/stylex";
import { BookOpenIcon } from "lucide-react";

import { type XStyle, xprops } from "@registry/stylex-calendar-theme/xprops";
import { buttonVariants } from "@registry/stylex-calendar-ui/button";

const docsUrl = "https://time.molten.sh";

const styles = stylex.create({
  link: {
    borderRadius: "9999px",
  },
});

/** A link styled as a ghost button, so it keeps link semantics. */
export function DocsLink({ xstyle }: { readonly xstyle?: XStyle }) {
  return (
    <a
      data-slot="button"
      href={docsUrl}
      {...xprops({}, buttonVariants({ variant: "ghost" }), styles.link, xstyle)}
    >
      <BookOpenIcon aria-hidden />
      Docs
    </a>
  );
}
