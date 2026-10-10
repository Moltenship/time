import { KeyboardIcon, MenuIcon } from "lucide-react";

import { CalendarToolbar } from "@registry/calendar/calendar-toolbar";
import { ViewSwitcher, type ViewSwitcherOption } from "@registry/calendar/view-switcher";
import { Button } from "@registry/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@registry/ui/tooltip";

import { DemoCalendar, type DemoView } from "../calendar";
import { viewFor } from "../scrolling";
import { BrandMark } from "./brand";
import { DocsLink } from "./docs-link";
import { ThemeToggle } from "./theme-toggle";

const viewOptions: readonly ViewSwitcherOption<DemoView>[] = [
  { label: "Day", shortcut: "D", value: "day" },
  { label: "Week", shortcut: "W", value: "week" },
  { label: "Month", shortcut: "M", value: "month" },
  { label: "Agenda", shortcut: "A", value: "agenda" },
  { label: "Resources", shortcut: "R", value: "resources" },
  { label: "Timeline", shortcut: "L", value: "timeline-week" },
];

const selectView = (state: { readonly view: DemoView }) => state.view;

export interface TopBarProps {
  readonly onOpenSidebar: () => void;
  readonly onShowShortcuts: () => void;
  /** Whether day, week, and month are their scrolling versions. */
  readonly scrolling: boolean;
}

export function TopBar({ onOpenSidebar, onShowShortcuts, scrolling }: TopBarProps) {
  const view = DemoCalendar.useCalendarSelector(selectView);
  const { setView } = DemoCalendar.useCalendarActions();
  const options = viewOptions.map((option) => ({
    ...option,
    value: viewFor(option.value, scrolling),
  }));

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
        options={options}
        value={view}
      />
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
