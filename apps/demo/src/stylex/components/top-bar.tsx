import * as stylex from "@stylexjs/stylex";
import { KeyboardIcon, MenuIcon } from "lucide-react";

import { CalendarToolbar } from "@registry/stylex-calendar/calendar-toolbar";
import { ViewSwitcher } from "@registry/stylex-calendar/view-switcher";
import { Button } from "@registry/stylex-calendar-ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@registry/stylex-calendar-ui/tooltip";

import type { DemoView } from "../../demo-model";
import { viewSwitcherOptions } from "../../view-choices";
import { StylexDemoCalendar } from "../calendar";
import { BrandMark } from "./brand";
import { DocsLink } from "./docs-link";
import { ThemeToggle } from "./theme-toggle";
import { FrameworkSwitch, UiSwitch } from "./ui-switch";

const small = "@media (min-width: 640px)";
const large = "@media (min-width: 1024px)";
const belowSmall = "@media (max-width: 639.98px)";
const belowLarge = "@media (max-width: 1023.98px)";

const styles = stylex.create({
  brand: {
    alignItems: "center",
    display: { default: "none", [large]: "flex" },
    flexShrink: 0,
    gap: "0.5rem",
    paddingInline: "0.25rem",
    width: "15rem",
  },
  brandName: {
    fontSize: "1.125rem",
    fontWeight: 500,
    lineHeight: "calc(1.75 / 1.125)",
  },
  menu: {
    borderRadius: "9999px",
    display: { default: "inline-flex", [large]: "none" },
  },
  // Below `lg` the bar has no room for it, and the drawer, open from the menu, has it.
  fromLarge: {
    display: { default: "flex", [belowLarge]: "none" },
  },
  fromSmall: {
    display: { default: "flex", [belowSmall]: "none" },
  },
  roundFromSmall: {
    borderRadius: "9999px",
    display: { default: "inline-flex", [belowSmall]: "none" },
  },
  // Wide enough for "Resources".
  viewSwitcher: {
    width: { default: null, [small]: "8rem" },
  },
});

const selectView = (state: { readonly view: DemoView }) => state.view;

export interface TopBarProps {
  /** Opens the sidebar's sheet from `from`, the button pressed. */
  readonly onOpenSidebar: (from: HTMLElement) => void;
  /** Opens the shortcuts dialog from `from`, the button pressed. */
  readonly onShowShortcuts: (from: HTMLElement) => void;
  /** Whether day, 3 days, week, month, and agenda are their scrolling versions. */
  readonly scrolling: boolean;
}

export function TopBar({ onOpenSidebar, onShowShortcuts, scrolling }: TopBarProps) {
  const view = StylexDemoCalendar.useCalendarSelector(selectView);
  const { setView } = StylexDemoCalendar.useCalendarActions();

  return (
    <CalendarToolbar
      calendar={StylexDemoCalendar}
      start={
        <>
          <Button
            aria-label="Open sidebar"
            onClick={(event) => onOpenSidebar(event.currentTarget)}
            size="icon"
            variant="ghost"
            xstyle={styles.menu}
          >
            <MenuIcon aria-hidden />
          </Button>
          <div {...stylex.props(styles.brand)}>
            <BrandMark />
            <span {...stylex.props(styles.brandName)}>Calendar</span>
          </div>
        </>
      }
    >
      <ViewSwitcher
        onValueChange={setView}
        options={viewSwitcherOptions(scrolling)}
        value={view}
        xstyle={styles.viewSwitcher}
      />
      <FrameworkSwitch xstyle={styles.fromLarge} />
      <UiSwitch xstyle={styles.fromSmall} />
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-label="Keyboard shortcuts"
              onClick={(event) => onShowShortcuts(event.currentTarget)}
              size="icon"
              variant="ghost"
              xstyle={styles.roundFromSmall}
            />
          }
        >
          <KeyboardIcon aria-hidden />
        </TooltipTrigger>
        <TooltipContent>Keyboard shortcuts (?)</TooltipContent>
      </Tooltip>
      <DocsLink xstyle={styles.roundFromSmall} />
      <ThemeToggle xstyle={styles.roundFromSmall} />
    </CalendarToolbar>
  );
}
