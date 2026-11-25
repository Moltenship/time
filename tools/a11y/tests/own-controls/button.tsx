// An app's own button in place of the kit's `button.tsx`, as "Use your own controls" in the theming
// docs describes: the file keeps the kit's name and props and renders the app's button, here
// shadcn's stock one, which is built on Base UI and not on ui-sdk. `data-own-control` lets the test
// see that every button came from here.
import type { ButtonProps } from "@registry/calendar-ui/button";
import { Button as AppButton } from "@/components/ui/button";

export type { ButtonProps };

export function Button(props: ButtonProps) {
  return <AppButton data-own-control="" {...props} />;
}
