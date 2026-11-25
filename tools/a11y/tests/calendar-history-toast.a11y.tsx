import {
  createCalendar,
  createCanonicalEventAdapter,
  createEventHistory,
  type CalendarEvent,
  type CalendarEventChange,
} from "@moltenship/calendar";
import { useState } from "react";
import { describe, expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { CalendarHistoryToast } from "@registry/calendar-history-toast/calendar-history-toast";
import { createAgendaView } from "@registry/list-view/agenda-view";
import { calendarAnnouncements } from "@registry/shared/calendar/announcements";

import { seriousViolations, setTheme, themes } from "./axe";
import { render, tab, until } from "./render";

// The undo toast in a real browser: it passes axe in both themes, F6 reaches Undo and goes back,
// Enter undoes, and Escape dismisses. tests/solid/calendar-history-toast.a11y.tsx checks the
// same in Solid.

type Meeting = CalendarEvent<null, string>;

const Calendar = createCalendar<Meeting, never>()({
  eventAdapter: createCanonicalEventAdapter<null, string>(),
  views: [createAgendaView<Meeting>()],
});

const standup: Meeting = {
  data: null,
  end: Temporal.Instant.from("2026-10-08T10:00:00Z"),
  id: "standup",
  kind: "timed",
  start: Temporal.Instant.from("2026-10-08T09:00:00Z"),
  title: "Standup",
};

/** Deletes the standup, as an event popover's Delete button would. */
function DeleteStandup() {
  const actions = Calendar.useCalendarActions();
  return (
    <button
      type="button"
      onClick={() => void actions.proposeEventChange({ cause: "delete", eventId: "standup" })}
    >
      Delete the standup
    </button>
  );
}

function Planner() {
  const [history] = useState(() => createEventHistory<Meeting, string, string>());
  const [events, setEvents] = useState<readonly Meeting[]>([standup]);
  const save = (change: CalendarEventChange<Meeting, string, string>) => {
    if (change.cause === "delete")
      setEvents((current) => current.filter(({ id }) => id !== change.eventId));
    else if (change.cause === "create")
      setEvents((current) => [...current, { ...change.event!, ...change.proposed } as Meeting]);
  };
  return (
    <main>
      <Calendar.Root
        defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
        defaultTimeZone="UTC"
        defaultView="agenda"
        events={events}
        locale="en-US"
        now={Temporal.Instant.from("2026-10-08T08:00:00Z")}
        onEventChange={save}
        onEventChangeResult={history.record}
        weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
      >
        <Calendar.Frame>
          <DeleteStandup />
          <Calendar.ActiveView />
        </Calendar.Frame>
        <Calendar.Announcer messages={calendarAnnouncements} />
        <CalendarHistoryToast calendar={Calendar} history={history} timeout={0} />
      </Calendar.Root>
    </main>
  );
}

const region = () => document.querySelector<HTMLElement>('[aria-label="Notifications"]');
const deleteButton = () =>
  [...document.querySelectorAll<HTMLElement>("button")].find(
    ({ textContent }) => textContent === "Delete the standup",
  )!;
const toastTitle = () => region()?.querySelector("li [id]")?.textContent ?? null;
const occurrence = () => document.querySelector('[data-event-id="standup"]');

async function deleteFromKeyboard() {
  deleteButton().focus();
  await userEvent.keyboard("{Enter}");
  await until(() => expect(toastTitle()).toBe("Event deleted"));
}

describe.each(themes)("undo toast, %s theme", (theme) => {
  test("passes axe while it shows", async () => {
    setTheme(theme);
    await render(<Planner />);
    await deleteFromKeyboard();

    expect(await seriousViolations()).toEqual([]);
  });
});

test("F6 reaches Undo, Enter undoes, and the toast offers Redo", async () => {
  setTheme("light");
  await render(<Planner />);
  await deleteFromKeyboard();
  expect(occurrence()).toBeNull();

  await userEvent.keyboard("{F6}");
  await until(() => expect(region()?.contains(document.activeElement)).toBe(true));
  // From the region or the toast to its first button.
  for (let tabs = 0; tabs < 3 && document.activeElement?.textContent !== "Undo"; tabs += 1) {
    await userEvent.keyboard(tab);
  }
  expect(document.activeElement?.textContent).toBe("Undo");
  await userEvent.keyboard("{Enter}");

  await until(() => expect(occurrence()).not.toBeNull());
  await until(() => expect(toastTitle()).toBe("Undid the delete"));
  expect(
    [...region()!.querySelectorAll("button")].map(
      (button) => button.getAttribute("aria-label") ?? button.textContent,
    ),
  ).toEqual(["Redo", "Dismiss"]);
});

test("F6 again goes back to where focus was, and Escape dismisses the toast", async () => {
  setTheme("dark");
  await render(<Planner />);
  await deleteFromKeyboard();

  await userEvent.keyboard("{F6}");
  await until(() => expect(region()?.contains(document.activeElement)).toBe(true));
  await userEvent.keyboard("{F6}");
  await until(() => expect(document.activeElement).toBe(deleteButton()));

  await userEvent.keyboard("{F6}");
  await until(() => expect(region()?.contains(document.activeElement)).toBe(true));
  await userEvent.keyboard("{Escape}");
  await until(() => expect(toastTitle()).toBeNull());
});
