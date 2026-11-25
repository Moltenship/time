import { DragDropProvider } from "@dnd-kit/react";
import { CalendarDndKit } from "@moltenship/calendar-dnd-kit";
import * as stylex from "@stylexjs/stylex";
import { PlusIcon } from "lucide-react";
import { useRef } from "react";

import { calendarAnnouncements } from "@registry/shared/calendar/announcements";
import { CalendarHistoryToast } from "@registry/stylex-calendar-history-toast/calendar-history-toast";
import { useRecurrenceScopePrompt } from "@registry/stylex-recurrence-scope-dialog/use-recurrence-scope-prompt";
import { Button } from "@registry/stylex-calendar-ui/button";

import { withDragAnnouncements } from "../drag-announcements";
import { useDemoWorkspace } from "../use-demo-workspace";
import { StylexDemoCalendar } from "./calendar";
import { ActivityList } from "./components/activity-list";
import { BrandMark } from "./components/brand";
import { DocsLink } from "./components/docs-link";
import { EventDialog } from "./components/event-dialog";
import { EventPopover } from "./components/event-popover";
import { KeyboardShortcuts } from "./components/keyboard-shortcuts";
import { Notice } from "./components/notice";
import { SettingsPanel } from "./components/settings-panel";
import { ShortcutsDialog } from "./components/shortcuts-dialog";
import { Sidebar } from "./components/sidebar";
import { ThemeToggle } from "./components/theme-toggle";
import { TopBar } from "./components/top-bar";
import { FrameworkSwitch, UiSwitch } from "./components/ui-switch";
import { UnscheduledTasks } from "./components/unscheduled-tasks";
import { Sheet, SheetTitle } from "./ui/sheet";

const large = "@media (min-width: 1024px)";

const styles = stylex.create({
  frame: {
    display: "flex",
    flexDirection: "column",
    height: "100dvh",
  },
  body: {
    display: "flex",
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "0%",
    minHeight: 0,
  },
  aside: {
    display: { default: "none", [large]: "block" },
    flexShrink: 0,
    overflowY: "auto",
    width: "16rem",
  },
  main: {
    "--calendar-surface": { default: null, [large]: "var(--card)" },
    backgroundColor: { default: null, [large]: "var(--card)" },
    borderColor: "var(--border)",
    borderRadius: { default: null, [large]: "calc(var(--radius) * 1.4)" },
    borderStyle: "solid",
    borderBottomWidth: { default: 0, [large]: 1 },
    borderLeftWidth: { default: 0, [large]: 1 },
    borderRightWidth: { default: 0, [large]: 1 },
    borderTopWidth: 1,
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    marginBottom: { default: null, [large]: "0.75rem" },
    marginRight: { default: null, [large]: "0.75rem" },
    minWidth: 0,
    overflow: { default: null, [large]: "clip" },
  },
  viewport: {
    height: "100%",
  },
  // Above the views' events, which stack in their own layers.
  create: {
    borderRadius: "calc(var(--radius) * 1.8)",
    bottom: "1rem",
    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
    display: { default: "inline-flex", [large]: "none" },
    height: "3.5rem",
    position: "fixed",
    right: "1rem",
    width: "3.5rem",
    zIndex: 30,
  },
  createIcon: {
    height: "1.5rem",
    width: "1.5rem",
  },
  sheetBar: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: "0.5rem",
    height: "3.5rem",
    paddingLeft: "1rem",
    paddingRight: "3rem",
  },
  sheetDocs: {
    marginLeft: "auto",
  },
  round: {
    borderRadius: "9999px",
  },
  switches: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.5rem",
    marginInline: "1rem",
  },
  sheetScroll: {
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
    overflowY: "auto",
  },
  history: {
    bottom: { default: "6rem", [large]: "1.5rem" },
  },
});

/** The demo on StyleX and ui-sdk, on the same state and data as the Tailwind page's `App`. */
export function StylexApp() {
  const { ask, dialog: scopeDialog } = useRecurrenceScopePrompt();
  const workspace = useDemoWorkspace(ask);
  const { draft, failSaves, hiddenCalendars, hiddenSources, history, locale, notice } = workspace;
  const { openCreate, openEvent, scheduleTask, scrolling, settings, shownEvent } = workspace;
  const { showShortcuts, sidebarOpen, tasks, timeZone, today } = workspace;
  const sheetRef = useRef<HTMLDivElement>(null);
  const sidebar = (onNavigate?: () => void) => (
    <Sidebar
      hiddenCalendars={hiddenCalendars}
      onCreate={openCreate}
      onNavigate={onNavigate}
      onToggleCalendar={workspace.toggleCalendar}
      today={today}
    >
      <UnscheduledTasks onSchedule={scheduleTask} taskList={tasks} />
      <ActivityList hidden={hiddenSources} onToggle={workspace.toggleSource} />
      <SettingsPanel
        dragPreview={workspace.dragPreview}
        failSaves={failSaves}
        onChange={workspace.changeSettings}
        onDragPreviewChange={workspace.setDragPreview}
        onFailSavesChange={workspace.setFailSaves}
        onReset={workspace.resetDemoData}
        settings={settings}
        systemTimeZone={workspace.systemTimeZone}
      />
    </Sidebar>
  );

  return (
    <StylexDemoCalendar.Root {...workspace.calendarProps}>
      <KeyboardShortcuts onCreate={openCreate} onHelp={showShortcuts} scrolling={scrolling} />
      {/* Tasks drag into the calendar, and one-off events out to the tasks, through dnd-kit. */}
      <DragDropProvider plugins={withDragAnnouncements}>
        <CalendarDndKit />
        <StylexDemoCalendar.Frame {...stylex.props(styles.frame)}>
          <TopBar
            onOpenSidebar={() => workspace.setSidebarOpen(true)}
            onShowShortcuts={showShortcuts}
            scrolling={scrolling}
          />
          <div {...stylex.props(styles.body)}>
            <aside {...stylex.props(styles.aside)}>{sidebar()}</aside>
            <main {...stylex.props(styles.main)}>
              <StylexDemoCalendar.Viewport
                ref={workspace.viewportRef}
                onClick={workspace.openClickedEvent}
                {...stylex.props(styles.viewport)}
              >
                <StylexDemoCalendar.ActiveView />
              </StylexDemoCalendar.Viewport>
            </main>
          </div>
          <Button aria-label="Create event" onClick={openCreate} xstyle={styles.create}>
            <PlusIcon aria-hidden {...stylex.props(styles.createIcon)} />
          </Button>
          <Sheet initialFocus={sheetRef} onOpenChange={workspace.setSidebarOpen} open={sidebarOpen}>
            <div {...stylex.props(styles.sheetBar)}>
              <BrandMark />
              <SheetTitle>Calendar</SheetTitle>
              <DocsLink xstyle={styles.sheetDocs} />
              <ThemeToggle xstyle={styles.round} />
            </div>
            <div {...stylex.props(styles.switches)}>
              <FrameworkSwitch />
              <UiSwitch />
            </div>
            <div {...stylex.props(styles.sheetScroll)}>
              {sidebar(() => workspace.setSidebarOpen(false))}
            </div>
          </Sheet>
          <EventPopover
            anchor={openEvent?.anchor ?? null}
            locale={locale}
            occurrence={shownEvent}
            onClose={workspace.closePopover}
            onEdit={workspace.openEdit}
            onUnscheduled={workspace.onUnscheduled}
            taskList={tasks}
            timeZone={timeZone}
          />
          <EventDialog
            draft={draft}
            locale={locale}
            onOpenChange={workspace.closeDialog}
            onSave={workspace.saveFromDialog}
            returnFocus={workspace.returnFocus}
            timeZone={timeZone}
          />
          {/* Asks "this, this and following, or all" for changes to a repeating event. */}
          {scopeDialog}
          <ShortcutsDialog
            open={workspace.shortcutsOpen}
            onOpenChange={workspace.setShortcutsOpen}
          />
          {/* Speaks keyboard and pointer moves, resizes and creates. */}
          <StylexDemoCalendar.Announcer messages={calendarAnnouncements} />
          <Notice text={notice} />
          <CalendarHistoryToast
            calendar={StylexDemoCalendar}
            history={history}
            xstyle={styles.history}
          />
        </StylexDemoCalendar.Frame>
      </DragDropProvider>
    </StylexDemoCalendar.Root>
  );
}
