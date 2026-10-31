import { cn } from "cn";

import { buttonVariants } from "@registry/ui/button";

import { demoUis, uiHref, type DemoUi } from "../ui-switch";

/** The demo's two UIs as links, since each is a page of its own. */
export function UiSwitch({
  className,
  current,
}: {
  readonly className?: string;
  readonly current: DemoUi;
}) {
  return (
    <div
      aria-label="UI"
      className={cn("flex shrink-0 items-center rounded-full border p-0.5", className)}
      role="group"
    >
      {demoUis.map(({ label, value }) => (
        <a
          key={value}
          aria-current={value === current ? "page" : undefined}
          className={cn(
            buttonVariants({ size: "sm", variant: value === current ? "secondary" : "ghost" }),
            "h-7 rounded-full",
          )}
          href={uiHref(value)}
          onClick={(click) => {
            click.currentTarget.href = uiHref(value);
          }}
        >
          {label}
        </a>
      ))}
    </div>
  );
}
