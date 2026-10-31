import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Text } from "@astryxdesign/core/Text";
import * as stylex from "@stylexjs/stylex";
import { KeyboardIcon, MenuIcon } from "lucide-react";

import { CalendarToolbar } from "@registry/stylex-calendar/calendar-toolbar";
import { ViewSwitcher } from "@registry/stylex-calendar/view-switcher";

import type { DemoView } from "../../demo-model";
import { viewSwitcherOptions } from "../../view-options";
import { StylexDemoCalendar } from "../calendar";
import { BrandMark } from "./brand";
import { DocsLink } from "./docs-link";
import { ThemeToggle } from "./theme-toggle";
import { UiSwitch } from "./ui-switch";

const styles = stylex.create({
  brand: {
    alignItems: "center",
    display: { default: "none", "@media (min-width: 1024px)": "flex" },
    flexShrink: 0,
    gap: "0.5rem",
    paddingInline: "0.25rem",
    width: "15rem",
  },
  // On wrappers that aren't boxes of their own: a `display` set on an Astryx control would replace
  // its own.
  fromTablet: {
    display: { default: "contents", "@media (max-width: 639.98px)": "none" },
  },
  menu: {
    display: { default: "contents", "@media (min-width: 1024px)": "none" },
  },
});

const selectView = (state: { readonly view: DemoView }) => state.view;

export interface TopBarProps {
  readonly onOpenSidebar: () => void;
  readonly onShowShortcuts: () => void;
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
          <div {...stylex.props(styles.menu)}>
            <IconButton
              icon={<Icon icon={MenuIcon} />}
              label="Open sidebar"
              onClick={onOpenSidebar}
              variant="ghost"
            />
          </div>
          <div {...stylex.props(styles.brand)}>
            <BrandMark />
            <Text size="lg" weight="medium">
              Calendar
            </Text>
          </div>
        </>
      }
    >
      <ViewSwitcher onValueChange={setView} options={viewSwitcherOptions(scrolling)} value={view} />
      <div {...stylex.props(styles.fromTablet)}>
        <UiSwitch />
        <IconButton
          icon={<Icon icon={KeyboardIcon} />}
          label="Keyboard shortcuts"
          onClick={onShowShortcuts}
          tooltip="Keyboard shortcuts (?)"
          variant="ghost"
        />
        <DocsLink />
        <ThemeToggle />
      </div>
    </CalendarToolbar>
  );
}
