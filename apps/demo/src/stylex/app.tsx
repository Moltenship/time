import { DragDropProvider } from "@dnd-kit/react";
import { AppShell } from "@astryxdesign/core/AppShell";
import { Drawer, DrawerHeader } from "@astryxdesign/core/Drawer";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import { CalendarDndKit } from "@moltenship/calendar-dnd-kit";
import * as stylex from "@stylexjs/stylex";
import { PlusIcon } from "lucide-react";

import { calendarAnnouncements } from "@registry/stylex-calendar/announcements";
import { CalendarHistoryToast } from "@registry/stylex-calendar-history-toast/calendar-history-toast";
import { useRecurrenceScopePrompt } from "@registry/stylex-recurrence-scope-dialog/use-recurrence-scope-prompt";

import { withDragAnnouncements } from "../drag-announcements";
import { useTheme } from "../theme";
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
import { UiSwitch } from "./components/ui-switch";
import { UnscheduledTasks } from "./components/unscheduled-tasks";

const styles = stylex.create({
  aside: {
    width: "16rem",
  },
  // Above the views' events, which stack in their own layers.
  create: {
    bottom: "1rem",
    display: { default: null, "@media (min-width: 1024px)": "none" },
    position: "fixed",
    right: "1rem",
    zIndex: 30,
  },
  drawerBar: {
    alignItems: "center",
    display: "flex",
    gap: "0.25rem",
    justifyContent: "space-between",
    paddingBlockEnd: "0.5rem",
    paddingInline: "0.75rem",
  },
  history: {
    bottom: { default: "6rem", "@media (min-width: 1024px)": "1.5rem" },
  },
  viewport: {
    height: "100%",
  },
});

/** The demo on StyleX and Astryx, on the same state and data as the Tailwind page's `App`. */
export function StylexApp() {
  const { theme } = useTheme();
  return (
    <Theme mode={theme} theme={neutralTheme}>
      <Workspace />
    </Theme>
  );
}

function Workspace() {
  const { ask, dialog: scopeDialog } = useRecurrenceScopePrompt();
  const workspace = useDemoWorkspace(ask);
  const { draft, failSaves, hiddenCalendars, hiddenSources, history, locale, notice } = workspace;
  const { openCreate, openEvent, scheduleTask, scrolling, settings, setSidebarOpen } = workspace;
  const { showShortcuts, shownEvent, sidebarOpen, tasks, timeZone, today } = workspace;
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
        failSaves={failSaves}
        onChange={workspace.changeSettings}
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
        <StylexDemoCalendar.Frame>
          <AppShell
            mobileNav={{
              breakpoint: "lg",
              // The app's own drawer: the sidebar's sections, not a navigation menu.
              content: (
                <Drawer
                  isOpen={sidebarOpen}
                  label="Calendar"
                  onOpenChange={setSidebarOpen}
                  side="start"
                  width={288}
                >
                  <Layout
                    content={
                      <LayoutContent padding={0}>
                        <div {...stylex.props(styles.drawerBar)}>
                          <UiSwitch />
                          <DocsLink />
                          <ThemeToggle />
                        </div>
                        {sidebar(() => setSidebarOpen(false))}
                      </LayoutContent>
                    }
                    header={
                      <DrawerHeader
                        onOpenChange={setSidebarOpen}
                        startContent={<BrandMark />}
                        title="Calendar"
                      />
                    }
                  />
                </Drawer>
              ),
              hasToggle: false,
              isOpen: sidebarOpen,
              onOpenChange: setSidebarOpen,
            }}
            sideNav={<aside {...stylex.props(styles.aside)}>{sidebar()}</aside>}
            topNav={
              <TopBar
                onOpenSidebar={() => setSidebarOpen(true)}
                onShowShortcuts={showShortcuts}
                scrolling={scrolling}
              />
            }
          >
            <StylexDemoCalendar.Viewport
              ref={workspace.viewportRef}
              onClick={workspace.openClickedEvent}
              {...stylex.props(styles.viewport)}
            >
              <StylexDemoCalendar.ActiveView />
            </StylexDemoCalendar.Viewport>
          </AppShell>
          <div {...stylex.props(styles.create)}>
            <IconButton
              elevation="high"
              icon={<Icon icon={PlusIcon} />}
              label="Create event"
              onClick={openCreate}
              size="lg"
              variant="primary"
            />
          </div>
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
            weekStartsOn={settings.weekStartsOn}
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
