import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { BookOpenIcon } from "lucide-react";

const docsUrl = "https://time.molten.sh";

/** A link styled as a ghost button, so it keeps link semantics. */
export function DocsLink() {
  return <Button href={docsUrl} icon={<Icon icon={BookOpenIcon} />} label="Docs" variant="ghost" />;
}
