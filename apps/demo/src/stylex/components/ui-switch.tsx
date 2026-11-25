import * as stylex from "@stylexjs/stylex";

import { type XStyle, xprops } from "@registry/stylex-calendar-theme/xprops";
import { buttonVariants } from "@registry/stylex-calendar-ui/button";

import {
  demoFrameworks,
  demoUis,
  frameworkHref,
  uiHref,
  type DemoFramework,
  type DemoUi,
} from "../../ui-switch";

const styles = stylex.create({
  group: {
    alignItems: "center",
    borderColor: "var(--border)",
    borderRadius: "9999px",
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    flexShrink: 0,
    padding: "0.125rem",
  },
  option: {
    borderRadius: "9999px",
    height: "1.75rem",
  },
});

/** Pages as a group of links, since each is a page of its own. */
function PageSwitch<TValue extends string>({
  current,
  href,
  label,
  options,
  xstyle,
}: {
  readonly current: TValue;
  readonly href: (value: TValue) => string;
  readonly label: string;
  readonly options: readonly { readonly label: string; readonly value: TValue }[];
  readonly xstyle?: XStyle;
}) {
  return (
    <div aria-label={label} role="group" {...xprops({}, styles.group, xstyle)}>
      {options.map((option) => (
        <a
          key={option.value}
          aria-current={option.value === current ? "page" : undefined}
          data-slot="button"
          href={href(option.value)}
          // The URL's view and date change after the render that set the link's address.
          onClick={(click) => {
            click.currentTarget.href = href(option.value);
          }}
          {...xprops(
            {},
            buttonVariants({
              size: "sm",
              variant: option.value === current ? "secondary" : "ghost",
            }),
            styles.option,
          )}
        >
          {option.label}
        </a>
      ))}
    </div>
  );
}

/** The demo's two UIs. */
export function UiSwitch({ xstyle }: { readonly xstyle?: XStyle }) {
  return (
    <PageSwitch<DemoUi>
      current="stylex"
      href={(ui) => uiHref(ui)}
      label="UI"
      options={demoUis}
      xstyle={xstyle}
    />
  );
}

/** React, this demo, and Solid, the Solid demo's page. */
export function FrameworkSwitch({ xstyle }: { readonly xstyle?: XStyle }) {
  return (
    <PageSwitch<DemoFramework>
      current="react"
      href={(framework) => frameworkHref(framework)}
      label="Framework"
      options={demoFrameworks}
      xstyle={xstyle}
    />
  );
}
