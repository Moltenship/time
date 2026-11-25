import { buttonVariants } from "@registry/calendar-ui/button";
import { cn } from "cn";

import { BookOpenIcon } from "../icons";

const docsUrl = "https://time.molten.sh";

/** A link styled as a ghost button, so it keeps link semantics. */
export function DocsLink(props: { readonly class?: string }) {
  return (
    <a class={cn(buttonVariants({ variant: "ghost" }), "rounded-full", props.class)} href={docsUrl}>
      <BookOpenIcon />
      Docs
    </a>
  );
}
