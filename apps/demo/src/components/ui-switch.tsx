import { cn } from "cn";

import { buttonVariants } from "@registry/ui/button";

import {
  demoFrameworks,
  demoUis,
  frameworkHref,
  uiHref,
  type DemoFramework,
  type DemoUi,
} from "../ui-switch";

/** Pages as a group of links, since each is a page of its own. */
function PageSwitch<TValue extends string>({
  className,
  current,
  href,
  label,
  options,
}: {
  readonly className?: string;
  readonly current: TValue;
  readonly href: (value: TValue) => string;
  readonly label: string;
  readonly options: readonly { readonly label: string; readonly value: TValue }[];
}) {
  return (
    <div
      aria-label={label}
      className={cn("flex shrink-0 items-center rounded-full border p-0.5", className)}
      role="group"
    >
      {options.map((option) => (
        <a
          key={option.value}
          aria-current={option.value === current ? "page" : undefined}
          className={cn(
            buttonVariants({
              size: "sm",
              variant: option.value === current ? "secondary" : "ghost",
            }),
            "h-7 rounded-full",
          )}
          href={href(option.value)}
          // The URL's view and date change after the render that set the link's address.
          onClick={(click) => {
            click.currentTarget.href = href(option.value);
          }}
        >
          {option.label}
        </a>
      ))}
    </div>
  );
}

/** The demo's two UIs. */
export function UiSwitch({
  className,
  current,
}: {
  readonly className?: string;
  readonly current: DemoUi;
}) {
  return (
    <PageSwitch
      className={className}
      current={current}
      href={(ui) => uiHref(ui)}
      label="UI"
      options={demoUis}
    />
  );
}

/** React, this demo, and Solid, the Solid demo's page. */
export function FrameworkSwitch({ className }: { readonly className?: string }) {
  return (
    <PageSwitch<DemoFramework>
      className={className}
      current="react"
      href={(framework) => frameworkHref(framework)}
      label="Framework"
      options={demoFrameworks}
    />
  );
}
