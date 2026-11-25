import { KeyboardIcon, MenuIcon } from "lucide-react";

import { CalendarToolbar } from "@registry/calendar/calendar-toolbar";
import { ViewSwitcher } from "@registry/calendar/view-switcher";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

import { DemoCalendar, type DemoView } from "../calendar";
import { viewSwitcherOptions } from "../view-options";
import { BrandMark } from "./brand";
import { DocsLink } from "./docs-link";
import { ThemeToggle } from "./theme-toggle";
import { FrameworkSwitch, UiSwitch } from "./ui-switch";

const selectView = (state: { readonly view: DemoView }) => state.view;

export interface TopBarProps {
  readonly onOpenSidebar: () => void;
  readonly onShowShortcuts: () => void;
  /** Whether day, 3 days, week, month, and agenda are their scrolling versions. */
  readonly scrolling: boolean;
}

export function TopBar({ onOpenSidebar, onShowShortcuts, scrolling }: TopBarProps) {
  const view = DemoCalendar.useCalendarSelector(selectView);
  const { setView } = DemoCalendar.useCalendarActions();

  return (
    <CalendarToolbar
      calendar={DemoCalendar}
      start={
        <>
          <Button
            aria-label="Open sidebar"
            className="rounded-full lg:hidden"
            onClick={onOpenSidebar}
            size="icon"
            variant="ghost"
          >
            <MenuIcon />
          </Button>
          <div className="hidden w-60 shrink-0 items-center gap-2 px-1 lg:flex">
            <BrandMark />
            <span className="text-lg font-medium">Calendar</span>
          </div>
        </>
      }
    >
      <ViewSwitcher
        // Wide enough for "Resources".
        className="sm:w-32"
        onValueChange={setView}
        options={viewSwitcherOptions(scrolling)}
        value={view}
      />
      {/* From `lg`: below it the bar has no room for it, and the drawer, open from the menu, has it. */}
      <FrameworkSwitch className="max-lg:hidden" />
      <UiSwitch className="max-sm:hidden" current="tailwind" />
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-label="Keyboard shortcuts"
              className="rounded-full max-sm:hidden"
              onClick={onShowShortcuts}
              size="icon"
              variant="ghost"
            />
          }
        >
          <KeyboardIcon />
        </TooltipTrigger>
        <TooltipContent>Keyboard shortcuts (?)</TooltipContent>
      </Tooltip>
      <DocsLink className="max-sm:hidden" />
      <ThemeToggle className="rounded-full max-sm:hidden" />
    </CalendarToolbar>
  );
}
