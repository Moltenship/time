// @vitest-environment jsdom

import {
  availabilityPolicy,
  type CalendarAvailability,
  type CalendarEventChange,
  type CalendarFocus,
  type CalendarSemanticActions,
} from "@moltenship/calendar";
import { act } from "react";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { calendarAnnouncements } from "../calendar/announcements";
import { createWeekView } from "../time-grid-view/time-grid-view";
import { layOut, pointer } from "./pointer";
import { render } from "./render";
import {
  anchorDate,
  clock,
  createTestCalendar,
  text,
  timed,
  type ColoredEvent,
} from "./view-fixtures";

type Change = CalendarEventChange<ColoredEvent, string | number, string>;
type Mode = "block" | "warn";

const Calendar = createTestCalendar(createWeekView<ColoredEvent>());
const officeHours: CalendarAvailability = {
  weekly: [
    {
      days: [1, 2, 3, 4, 5],
      end: Temporal.PlainTime.from("17:00"),
      start: Temporal.PlainTime.from("09:00"),
    },
  ],
};
const standup = timed("standup", "2026-10-08T09:00Z", "2026-10-08T09:30Z");
/** Where every path moves the standup: half past the end of the working day. */
const late = {
  end: Temporal.Instant.from("2026-10-08T17:15:00Z"),
  kind: "timed",
  start: Temporal.Instant.from("2026-10-08T16:45:00Z"),
} as const;

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

async function renderWeek(mode: Mode, defaultFocus: CalendarFocus | null = null) {
  const onEventChange = vi.fn<(change: Change) => void>();
  const policies = [availabilityPolicy<ColoredEvent, string | number, string>({ mode })];
  let actions: CalendarSemanticActions<string, never, never, string, ColoredEvent> | undefined;
  function Actions() {
    actions = Calendar.useCalendarActions() as typeof actions;
    return null;
  }
  const view = await render(
    <Calendar.Root
      availability={officeHours}
      clock={clock}
      defaultAnchorDate={anchorDate}
      defaultFocus={defaultFocus}
      defaultTimeZone="UTC"
      defaultView="week"
      events={[standup]}
      locale="en-US"
      onEventChange={onEventChange}
      policies={policies}
      weekRules={{ firstDay: 7, minimalDays: 1, weekend: [6, 7] }}
    >
      <Actions />
      <Calendar.ActiveView />
      <Calendar.Announcer messages={calendarAnnouncements} />
    </Calendar.Root>,
  );
  cleanup = view.unmount;
  const { container } = view;
  return {
    actions: actions!,
    chip: () =>
      container.querySelector<HTMLElement>('[data-event-id="standup"]:not([data-calendar-ghost])')!,
    container,
    onEventChange,
    spoken: () => text(container.querySelector('[data-calendar-part="announcer"]'))?.trim(),
  };
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve));
  });
}

async function press(key: string) {
  await act(async () => {
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }),
    );
  });
}

/** What each path leaves behind: the changes the app received, and what it heard. */
function outcome(calls: readonly (readonly [Change])[]) {
  return calls.map(([change]) => ({
    cause: change.cause,
    end: change.proposed?.end.toString(),
    start: change.proposed?.start.toString(),
    warnings: change.warnings,
  }));
}

const expected = {
  block: {
    changes: [],
    result: { reason: "outside-availability", status: "rejected" },
    spoken: "standup can't go outside working hours, so it's back where it was.",
  },
  warn: {
    changes: [
      {
        cause: "move",
        end: "2026-10-08T17:15:00Z",
        start: "2026-10-08T16:45:00Z",
        warnings: ["outside-availability"],
      },
    ],
    result: { status: "committed" },
    spoken: "Moved standup to Thursday, October 8, 4:45 – 5:15 PM, outside working hours.",
  },
} as const;

describe.each(["block", "warn"] as const)("%s mode", (mode) => {
  const preview = mode === "block" ? "data-invalid" : "data-warning";

  test("an explicit proposal", async () => {
    const { actions, onEventChange } = await renderWeek(mode);
    const proposal = { cause: "move", eventId: "standup", proposed: late } as const;

    expect(actions.checkEventChange(proposal)?.status).toBe(
      mode === "block" ? "rejected" : "accepted",
    );
    let result;
    await act(async () => {
      result = await actions.proposeEventChange(proposal);
    });
    expect(result).toMatchObject(expected[mode].result);
    expect(outcome(onEventChange.mock.calls)).toEqual(expected[mode].changes);
  });

  test("the keyboard previews the invalid state, then ends the same", async () => {
    const { chip, container, onEventChange, spoken } = await renderWeek(mode, {
      date: anchorDate,
      eventId: "standup",
      kind: "event",
    });
    await act(async () =>
      container.querySelector<HTMLElement>('[role="grid"] [tabindex="0"]')!.focus(),
    );
    await press(" ");
    expect(chip().hasAttribute(preview)).toBe(false);
    // 31 quarter hours later: 16:45.
    for (let step = 0; step < 31; step += 1) await press("ArrowDown");
    expect(chip().hasAttribute(preview)).toBe(true);
    expect(spoken()).toBe("Thursday, October 8, 4:45 – 5:15 PM, outside working hours");
    await press("Enter");
    await settle();

    expect(outcome(onEventChange.mock.calls)).toEqual(expected[mode].changes);
    expect(spoken()).toBe(expected[mode].spoken);
  });

  test("a pointer drag previews the invalid state, then ends the same", async () => {
    const { container, onEventChange, spoken } = await renderWeek(mode);
    // Sunday-first columns, 100px wide and 30px per hour below a 100px header, so the preview
    // stays inside jsdom's 1024×768 viewport.
    const columns = [...container.querySelectorAll("[data-date]:not([data-all-day])")];
    const event = container.querySelector('[data-event-id="standup"]')!;
    const hour = (hours: number) => 100 + hours * 30;
    layOut([
      [event, { height: 15, width: 100, x: 400, y: hour(9) }],
      ...columns.map(
        (column, index) => [column, { height: 720, width: 100, x: index * 100, y: 100 }] as const,
      ),
    ]);

    act(() => {
      pointer(event, "pointerdown", [450, hour(9.1)]);
      pointer(event, "pointermove", [450, hour(10)]);
    });
    const ghost = () => container.querySelector("[data-calendar-ghost]");
    expect(ghost()?.hasAttribute(preview)).toBe(false);
    act(() => pointer(event, "pointermove", [450, hour(16.85)]));
    expect(ghost()?.hasAttribute(preview)).toBe(true);
    expect(spoken()).toBe("Thursday, October 8, 4:45 – 5:15 PM, outside working hours");
    act(() => pointer(event, "pointerup", [450, hour(16.85)]));
    await settle();

    expect(outcome(onEventChange.mock.calls)).toEqual(expected[mode].changes);
    expect(spoken()).toBe(expected[mode].spoken);
  });
});

test("previews inside working hours show no warning", async () => {
  const { actions } = await renderWeek("block");
  const check = actions.checkEventChange({
    cause: "move",
    eventId: "standup",
    proposed: {
      end: Temporal.Instant.from("2026-10-08T17:00:00Z"),
      kind: "timed",
      start: Temporal.Instant.from("2026-10-08T16:30:00Z"),
    },
  });
  expect(check?.status).toBe("accepted");
  expect(check?.change.warnings).toBeUndefined();
});
