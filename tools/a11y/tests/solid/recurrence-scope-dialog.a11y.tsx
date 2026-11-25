import { createCalendar, type CalendarEventChange } from "@moltenship/calendar-solid";
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
import { createMemo, createSignal } from "solid-js";
import { describe, expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { createAgendaView } from "@registry/list-view/agenda-view";
import type {
  RecurrenceEditScope,
  RecurrenceScopeAction,
} from "@registry/recurrence-scope-dialog/recurrence-scope-dialog";
import { useRecurrenceScopePrompt } from "@registry/recurrence-scope-dialog/use-recurrence-scope-prompt";

import { seriousViolations, setTheme, themes } from "../axe";
import { render, shiftTab, tab, until } from "./render";

// The React dialog's checks (recurrence-scope-dialog.a11y.tsx and, over a view,
// recurrence-scope-dialog-week.a11y.tsx), in Solid: the same names, keys, focus and answers.

/** A page with an event that asks, as `onEventChange` would, and shows the answer. */
function Page(props: {
  readonly action?: RecurrenceScopeAction;
  readonly dir?: "ltr" | "rtl";
  readonly scopes?: readonly RecurrenceEditScope[];
}) {
  const { ask, dialog } = useRecurrenceScopePrompt();
  const [answer, setAnswer] = createSignal("none yet");

  return (
    <main class="p-4" dir={props.dir}>
      <h1 class="text-lg font-medium">Week</h1>
      <button
        type="button"
        data-event-id="standup"
        class="rounded-md border px-2 py-1"
        onClick={async () => {
          const scope = await ask({
            action: props.action ?? "edit",
            eventTitle: "Standup",
            scopes: props.scopes,
          });
          setAnswer(scope ?? "cancelled");
        }}
      >
        Standup
      </button>
      <output data-testid="answer">{answer()}</output>
      {dialog}
    </main>
  );
}

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
const event = () => document.querySelector<HTMLElement>('[data-event-id="standup"]')!;
const answer = () => document.querySelector('[data-testid="answer"]')!.textContent;
const focusedText = () => document.activeElement?.textContent;
const focusReaches = (text: string) => until(() => expect(focusedText()).toBe(text));
const textOf = (ids: string | null) =>
  (ids ?? "")
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");

/** Opens the question from the keyboard, as a keyboard move's Enter would. */
async function openFromKeyboard() {
  event().focus();
  await userEvent.keyboard("{Enter}");
  await until(() => expect(dialog()?.contains(document.activeElement)).toBe(true));
}

describe.each(themes)("recurrence scope dialog, %s theme", (theme) => {
  test.each(["edit", "delete"] as const)("the %s question", async (action) => {
    setTheme(theme);
    await render(() => <Page action={action} />);
    await openFromKeyboard();

    expect(await seriousViolations()).toEqual([]);
  });
});

test("the dialog is named by its title and described by its question", async () => {
  setTheme("light");
  await render(() => <Page action="delete" />);
  await openFromKeyboard();

  // Modal: the page behind is out of reach, for a pointer and assistive technology alike.
  await until(() => expect(event().closest("[inert]")).not.toBeNull());
  expect(textOf(dialog()!.getAttribute("aria-labelledby"))).toBe("Delete recurring event");
  expect(textOf(dialog()!.getAttribute("aria-describedby"))).toBe(
    "“Standup” repeats. Which events do you want to delete?",
  );
});

test("Tab and Shift+Tab stay in the dialog, and Enter picks a scope", async () => {
  setTheme("light");
  await render(() => <Page />);
  await openFromKeyboard();

  await focusReaches("This event");
  for (const text of ["This and following events", "All events", "Cancel", "This event"]) {
    await userEvent.keyboard(tab);
    await focusReaches(text);
  }
  await userEvent.keyboard(shiftTab);
  await focusReaches("Cancel");
  await userEvent.keyboard(shiftTab);
  await focusReaches("All events");

  await userEvent.keyboard("{Enter}");

  await until(() => expect(answer()).toBe("all"));
  await until(() => expect(dialog()).toBeNull());
  expect(document.activeElement).toBe(event());
});

test("the arrow keys move between the scopes and wrap at the ends", async () => {
  setTheme("light");
  await render(() => <Page />);
  await openFromKeyboard();

  await focusReaches("This event");
  for (const [key, text] of [
    ["{ArrowDown}", "This and following events"],
    ["{ArrowDown}", "All events"],
    ["{ArrowDown}", "This event"],
    ["{ArrowUp}", "All events"],
    ["{ArrowLeft}", "This and following events"],
    ["{ArrowRight}", "All events"],
  ] as const) {
    await userEvent.keyboard(key);
    await focusReaches(text);
  }

  await userEvent.keyboard("{Enter}");
  await until(() => expect(answer()).toBe("all"));
});

test("right to left, Left moves on and Right moves back", async () => {
  setTheme("dark");
  await render(() => <Page dir="rtl" />);
  await openFromKeyboard();

  await focusReaches("This event");
  await userEvent.keyboard("{ArrowLeft}");
  await focusReaches("This and following events");
  await userEvent.keyboard("{ArrowRight}");
  await focusReaches("This event");
  await userEvent.keyboard("{ArrowRight}");
  await focusReaches("All events");
});

test("Escape cancels and focus goes back to the event", async () => {
  setTheme("dark");
  await render(() => <Page scopes={["following", "all"]} />);
  await openFromKeyboard();

  await focusReaches("This and following events");
  await userEvent.keyboard("{Escape}");

  await until(() => expect(answer()).toBe("cancelled"));
  await until(() => expect(dialog()).toBeNull());
  expect(document.activeElement).toBe(event());
});

test("Space on Cancel cancels", async () => {
  setTheme("light");
  await render(() => <Page />);
  await openFromKeyboard();
  await focusReaches("This event");
  await userEvent.keyboard(shiftTab);
  await focusReaches("Cancel");

  await userEvent.keyboard(" ");

  await until(() => expect(answer()).toBe("cancelled"));
  await until(() => expect(document.activeElement).toBe(event()));
});

type Standup = RecurringCalendarEvent<null, string>;
type Occurrence = RecurrenceOccurrence<Standup, string>;

const adapters = createCanonicalRecurrenceAdapter<null, string, string>();
const Calendar = createCalendar<Occurrence, never>()({
  eventAdapter: createOccurrenceAdapter(adapters.event),
  views: [createAgendaView<Occurrence>()],
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

/** The agenda with the series expanded, and `onEventChange` asking for a scope. */
function Planner() {
  const { ask, dialog } = useRecurrenceScopePrompt();
  const expander = createOccurrenceExpander(adapters);
  const [events, setEvents] = createSignal<readonly Standup[]>([standup]);
  const occurrences = createMemo(() => expander.expand(events(), week).occurrences);

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
      occurrences: occurrences(),
      timeZone: week.timeZone,
    });
    if (edit.type !== "series") throw new Error(edit.type);
    setEvents((current) => applyRecurrenceEdit(current, edit, { createId: () => "standup-2" }));
  }

  return (
    <main>
      <Calendar.Root
        defaultAnchorDate={Temporal.PlainDate.from("2026-10-05")}
        defaultTimeZone="UTC"
        defaultView="agenda"
        events={occurrences()}
        locale="en-US"
        now={Temporal.Instant.from("2026-10-05T08:00:00Z")}
        onEventChange={onEventChange}
        weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
      >
        <DeleteMonday />
        <Calendar.ActiveView />
      </Calendar.Root>
      {dialog}
    </main>
  );
}

const occurrence = (id: string) => document.querySelector<HTMLElement>(`[data-event-id="${id}"]`);
const choices = () =>
  [...dialog()!.querySelectorAll("button")].map(({ textContent }) => textContent);

test("over the agenda, a delete asks the delete question, without This and following on the first occurrence", async () => {
  setTheme("light");
  await render(() => <Planner />);
  await until(() => expect(occurrence(monday)).not.toBeNull());
  const button = [...document.querySelectorAll("button")].find(
    ({ textContent }) => textContent === "Delete Monday's standup",
  )!;
  button.focus();
  await userEvent.keyboard("{Enter}");
  await until(() => expect(dialog()?.contains(document.activeElement)).toBe(true));

  expect(textOf(dialog()!.getAttribute("aria-labelledby"))).toBe("Delete recurring event");
  expect(textOf(dialog()!.getAttribute("aria-describedby"))).toBe(
    "“Standup” repeats. Which events do you want to delete?",
  );
  expect(choices()).toEqual(["This event", "All events", "Cancel"]);
  expect(await seriousViolations()).toEqual([]);

  await focusReaches("This event");
  await userEvent.keyboard("{Enter}");

  await until(() => expect(occurrence(monday)).toBeNull());
  await until(() => expect(document.activeElement).toBe(button));
  expect(occurrence("standup::2026-10-06T09:00:00Z")).not.toBeNull();
});
