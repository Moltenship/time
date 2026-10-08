import { cn } from "cn";
import { BookOpenIcon } from "lucide-react";

import { buttonVariants } from "@registry/ui/button";

const docsUrl = "https://moltenship-time.vercel.app";

/** A link styled as a ghost button, so it keeps link semantics. */
export function DocsLink({ className }: { readonly className?: string }) {
  return (
    <a
      className={cn(buttonVariants({ variant: "ghost" }), "rounded-full", className)}
      href={docsUrl}
    >
      <BookOpenIcon />
      Docs
    </a>
  );
}
