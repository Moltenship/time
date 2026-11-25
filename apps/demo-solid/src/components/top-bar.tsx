import { CalendarToolbar } from "@registry/calendar/calendar-toolbar";
import { ViewSwitcher } from "@registry/calendar/view-switcher";
import { Button } from "@registry/calendar-ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@registry/calendar-ui/tooltip";

import { viewChoices } from "@demo/view-choices";

import { Calendar } from "../calendar";
import { KeyboardIcon, MenuIcon } from "../icons";
import { viewFor } from "../scrolling";
import { hasView, viewNames } from "../workspace";
import { BrandMark } from "./brand";
import { DocsLink } from "./docs-link";
import { FrameworkSwitch } from "./page-switch";
import { ThemeToggle } from "./theme-toggle";

/** The React demo's view switcher options, for the views this page registers. */
function switcherOptions(scrolling: boolean) {
  return viewChoices.flatMap((option) =>
    hasView(option.value)
      ? [{ ...option, value: viewFor(option.value, scrolling, viewNames) }]
      : [],
  );
}

export function TopBar(props: {
  readonly onOpenSidebar: () => void;
  readonly onShowShortcuts: () => void;
  /** Whether the views are their scrolling versions. */
  readonly scrolling: boolean;
}) {
  const view = Calendar.useCalendarSelector((state) => state.view);
  const actions = Calendar.useCalendarActions();
  return (
    <CalendarToolbar
      calendar={Calendar}
      start={
        <>
          <Button
            aria-label="Open sidebar"
            class="rounded-full lg:hidden"
            onClick={() => props.onOpenSidebar()}
            size="icon"
            variant="ghost"
          >
            <MenuIcon />
          </Button>
          <div class="hidden w-60 shrink-0 items-center gap-2 px-1 lg:flex">
            <BrandMark />
            <span class="text-lg font-medium">Calendar</span>
          </div>
        </>
      }
    >
      <ViewSwitcher
        // Wide enough for "Resources".
        class="sm:w-32"
        onValueChange={(next) => actions.setView(next)}
        options={switcherOptions(props.scrolling)}
        value={view()}
      />
      {/* From `lg`: below it the bar has no room for it, and the sheet, open from the menu, has it. */}
      <FrameworkSwitch class="max-lg:hidden" />
      <Tooltip>
        <TooltipTrigger
          render={(trigger) => (
            <Button
              {...trigger}
              aria-label="Keyboard shortcuts"
              class="rounded-full max-sm:hidden"
              onClick={() => props.onShowShortcuts()}
              size="icon"
              variant="ghost"
            />
          )}
        >
          <KeyboardIcon />
        </TooltipTrigger>
        <TooltipContent>Keyboard shortcuts (?)</TooltipContent>
      </Tooltip>
      <DocsLink class="max-sm:hidden" />
      <ThemeToggle class="rounded-full max-sm:hidden" />
    </CalendarToolbar>
  );
}
