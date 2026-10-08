import { BookOpenIcon } from "lucide-react";

import { cn } from "@registry/lib/utils";
import { Button } from "@registry/ui/button";

const docsUrl = "https://moltenship-time.vercel.app";

export function DocsLink({ className }: { readonly className?: string }) {
  return (
    <Button asChild className={cn("rounded-full", className)} size="sm" variant="ghost">
      <a href={docsUrl}>
        <BookOpenIcon />
        Docs
      </a>
    </Button>
  );
}
