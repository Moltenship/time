import { MenuIcon } from "lucide-react";

import { CalendarToolbar } from "@registry/calendar/calendar-toolbar";
import { ViewSwitcher, type ViewSwitcherOption } from "@registry/calendar/view-switcher";
import { Button } from "@registry/ui/button";

import { DemoCalendar, type DemoView } from "../calendar";
import { BrandMark } from "./brand";
import { DocsLink } from "./docs-link";
import { ThemeToggle } from "./theme-toggle";

const viewOptions: readonly ViewSwitcherOption<DemoView>[] = [
  { label: "Day", shortcut: "D", value: "day" },
  { label: "Week", shortcut: "W", value: "week" },
  { label: "Month", shortcut: "M", value: "month" },
  { label: "Agenda", shortcut: "A", value: "agenda" },
];

const selectView = (state: { readonly view: DemoView }) => state.view;

export function TopBar({ onOpenSidebar }: { readonly onOpenSidebar: () => void }) {
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
      <ViewSwitcher onValueChange={setView} options={viewOptions} value={view} />
      <DocsLink className="max-sm:hidden" />
      <ThemeToggle className="rounded-full max-sm:hidden" />
    </CalendarToolbar>
  );
}
