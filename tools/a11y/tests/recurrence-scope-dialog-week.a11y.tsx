import { createCalendar, type CalendarEventChange, type CalendarFocus } from "@moltenship/calendar";
import {
  applyRecurrenceEdit,
  createCanonicalRecurrenceAdapter,
  createOccurrenceAdapter,
  createOccurrenceExpander,
  isRecurringChange,
  recurrenceEditScopes,
  resolveRecurrenceEdit,
  type RecurrenceOccurrence,
  type RecurringCalendarEvent,
} from "@moltenship/calendar-recurrence";
import { useMemo, useState } from "react";
import { expect, test, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { calendarAnnouncements } from "@registry/calendar/announcements";
import { useRecurrenceScopePrompt } from "@registry/recurrence-scope-dialog/use-recurrence-scope-prompt";
import { createWeekView } from "@registry/time-grid-view/time-grid-view";

import { seriousViolations, setTheme, themes } from "./axe";
import { inWebKit, render } from "./render";

type Standup = RecurringCalendarEvent<null, string>;
type Occurrence = RecurrenceOccurrence<Standup, string>;

const adapters = createCanonicalRecurrenceAdapter<null, string, string>();
const Calendar = createCalendar<Occurrence, never>()({
  eventAdapter: createOccurrenceAdapter(adapters.event),
  views: [createWeekView<Occurrence>()],
});

/** A standup every weekday morning, Monday, October 5 to Friday, October 9, 2026. */
const standup: Standup = {
  data: null,
  end: Temporal.Instant.from("2026-10-05T09:30:00Z"),
  id: "standup",
  kind: "timed",
  recurrence: { rule: { count: 5, frequency: "DAILY" } },
  start: Temporal.Instant.from("2026-10-05T09:00:00Z"),
  title: "Standup",
};
const monday = "standup::2026-10-05T09:00:00Z";
const thursday = "standup::2026-10-08T09:00:00Z";
/** The week the calendar shows, which the series expands over. */
const week = {
  range: {
    end: Temporal.PlainDate.from("2026-10-12"),
    start: Temporal.PlainDate.from("2026-10-05"),
  },
  timeZone: "UTC",
};

/** Deletes Monday's standup, as an event popover's Delete button would. */
function DeleteMonday() {
  const actions = Calendar.useCalendarActions();
  return (
    <button
      type="button"
      onClick={() => void actions.proposeEventChange({ cause: "delete", eventId: monday })}
    >
      Delete Monday's standup
    </button>
  );
}

/**
 * The week view with the series expanded, and `onEventChange` asking for a scope as the hook's
 * example does. Focus follows the edited occurrence to its new ID.
 */
function Planner() {
  const { ask, dialog } = useRecurrenceScopePrompt();
  const [expander] = useState(() => createOccurrenceExpander(adapters));
  const [events, setEvents] = useState<readonly Standup[]>([standup]);
  const occurrences = useMemo(() => expander.expand(events, week).occurrences, [events, expander]);
  const [focus, setFocus] = useState<CalendarFocus | null>(null);

  async function onEventChange(change: CalendarEventChange<Occurrence, string, string>) {
    if (!isRecurringChange(change)) return;
    const scope = await ask({
      action: change.cause === "delete" ? "delete" : "edit",
      eventTitle: change.event.event.title,
      scopes: recurrenceEditScopes(change, adapters, { timeZone: week.timeZone }),
    });
    // Rejecting rolls the change back; an `AbortError` is announced as a cancel.
    if (scope === null) throw new DOMException("Cancelled", "AbortError");
    const edit = resolveRecurrenceEdit(change, scope, adapters, {
      newSeriesId: "standup-2",
      occurrences,
      timeZone: week.timeZone,
    });
    if (edit.type !== "series") throw new Error(edit.type);
    setEvents((current) => applyRecurrenceEdit(current, edit, { createId: () => "standup-2" }));
    setFocus((current) =>
      current?.kind === "event"
        ? { ...current, eventId: edit.occurrenceIds.get(current.eventId) ?? current.eventId }
        : current,
    );
  }

  return (
    <main>
      <Calendar.Root
        defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
        defaultTimeZone="UTC"
        defaultView="week"
        events={occurrences}
        focus={focus}
        locale="en-US"
        now={Temporal.Instant.from("2026-10-08T12:00:00Z")}
        onEventChange={onEventChange}
        onFocusChange={setFocus}
        weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
      >
        <DeleteMonday />
        <Calendar.ActiveView />
        <Calendar.Announcer messages={calendarAnnouncements} />
      </Calendar.Root>
      {dialog}
    </main>
  );
}

/** Intl puts thin and narrow no-break spaces in times. */
const plain = (text: string | null | undefined) => text?.replace(/\s/g, " ").trim();
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
const occurrence = (id: string) => document.querySelector<HTMLElement>(`[data-event-id="${id}"]`);
const label = (element: Element | null) => plain(element?.getAttribute("aria-label"));
const choices = () =>
  [...dialog()!.querySelectorAll("button")].map(({ textContent }) => textContent);
const textOf = (ids: string | null) =>
  (ids ?? "")
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");

/** What the live region says from now on, in order. */
function listen(): readonly string[] {
  const region = document.querySelector('[data-calendar-part="announcer"]')!;
  const said: string[] = [];
  new MutationObserver(() => said.push(plain(region.textContent)!)).observe(region, {
    characterData: true,
    childList: true,
    subtree: true,
  });
  return said;
}

/** Picks an occurrence up from the keyboard, moves it with `keys`, and drops it. */
async function moveFromKeyboard(eventId: string, keys: string) {
  occurrence(eventId)!.focus();
  await userEvent.keyboard(" ");
  await userEvent.keyboard(keys);
  await userEvent.keyboard("{Enter}");
  // Focus can take over a second to move into the question in WebKit on temporal-polyfill on a
  // CI runner.
  await vi.waitFor(() => expect(dialog()?.contains(document.activeElement)).toBe(true), {
    timeout: inWebKit ? 3000 : 1000,
  });
}

/** Tabs to a choice in the dialog and presses Enter on it. */
async function choose(text: string) {
  // From the first choice, which the dialog focuses in the next animation frame.
  await vi.waitFor(() => expect(dialog()!.querySelector("button")).toBe(document.activeElement));
  for (let tabs = 0; tabs < 4 && document.activeElement?.textContent !== text; tabs += 1) {
    await userEvent.keyboard("{Tab}");
  }
  await userEvent.keyboard("{Enter}");
  await vi.waitFor(() => expect(dialog()).toBeNull());
}

test("a keyboard drop asks which events it applies to while the change waits", async () => {
  await render(<Planner />);
  const said = listen();
  await moveFromKeyboard(thursday, "{ArrowDown}");

  // The drop is announced once the change is saved, as for any event saved asynchronously.
  expect(said).toEqual([
    "Picked up Standup, Thursday, October 8, 9:00 – 9:30 AM. Use the arrow keys to move it, then Enter to drop it or Escape to cancel.",
    "Thursday, October 8, 9:15 – 9:45 AM",
  ]);
  expect(label(occurrence(thursday))).toBe("Standup, Thursday, October 8, 9:15 – 9:45 AM, saving");
  expect(textOf(dialog()!.getAttribute("aria-labelledby"))).toBe("Edit recurring event");
  expect(textOf(dialog()!.getAttribute("aria-describedby"))).toBe(
    "“Standup” repeats. Which events should this change apply to?",
  );
  expect(choices()).toEqual(["This event", "This and following events", "All events", "Cancel"]);
  // The dialog moves focus to its first choice in the next animation frame.
  await vi.waitFor(() => expect(document.activeElement?.textContent).toBe("This event"));
});

test.each([
  ["This event", thursday],
  ["This and following events", "standup-2::2026-10-08T09:15:00Z"],
  ["All events", "standup::2026-10-08T09:15:00Z"],
])("%s: focus goes back to the moved occurrence, and the move is announced", async (scope, id) => {
  await render(<Planner />);
  await moveFromKeyboard(thursday, "{ArrowDown}");
  const said = listen();

  await choose(scope);

  // "This event" keeps the occurrence's ID; the others give it a new one, which focus follows.
  await vi.waitFor(() => expect(document.activeElement).toBe(occurrence(id)));
  // Focus can come back before the change is saved, while the occurrence still says "saving".
  await vi.waitFor(() =>
    expect(label(document.activeElement)).toBe("Standup, Thursday, October 8, 9:15 – 9:45 AM"),
  );
  await vi.waitFor(() =>
    expect(said).toEqual(["Moved Standup to Thursday, October 8, 9:15 – 9:45 AM."]),
  );
});

test("Escape rolls the change back and focus goes back to the occurrence", async () => {
  await render(<Planner />);
  // To another day, where the occurrence's element is a new one.
  await moveFromKeyboard(thursday, "{ArrowRight}");
  const said = listen();

  await userEvent.keyboard("{Escape}");

  await vi.waitFor(() => expect(document.activeElement).toBe(occurrence(thursday)));
  expect(label(document.activeElement)).toBe("Standup, Thursday, October 8, 9:00 – 9:30 AM");
  // A cancelled question isn't a failed save.
  await vi.waitFor(() => expect(said).toEqual(["Cancelled. Standup is back where it was."]));
});

test("a delete asks the delete question, without This and following on the first occurrence", async () => {
  await render(<Planner />);
  const said = listen();
  const button = [...document.querySelectorAll("button")].find(
    ({ textContent }) => textContent === "Delete Monday's standup",
  )!;
  button.focus();
  await userEvent.keyboard("{Enter}");
  await vi.waitFor(() => expect(dialog()?.contains(document.activeElement)).toBe(true));

  expect(textOf(dialog()!.getAttribute("aria-labelledby"))).toBe("Delete recurring event");
  expect(textOf(dialog()!.getAttribute("aria-describedby"))).toBe(
    "“Standup” repeats. Which events do you want to delete?",
  );
  expect(choices()).toEqual(["This event", "All events", "Cancel"]);

  await choose("This event");

  await vi.waitFor(() => expect(occurrence(monday)).toBeNull());
  await vi.waitFor(() => expect(document.activeElement).toBe(button));
  // The calendar announces its own gestures; a change from the page's own controls is the page's
  // to announce.
  expect(said).toEqual([]);
});

test.each(themes)("the dialog over the week view, %s theme", async (theme) => {
  setTheme(theme);
  await render(<Planner />);
  await moveFromKeyboard(thursday, "{ArrowDown}");

  expect(await seriousViolations()).toEqual([]);
});
