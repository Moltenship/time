// @vitest-environment jsdom
// First, so dnd-kit finds the ResizeObserver it reads as it loads.
import "./resize-observer";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, expect, test, vi } from "vite-plus/test";

import { sampleMeetings, sampleTasks } from "../components/dnd-kit-preview/calendar";
import { BacklogCalendar, meetingFromTask } from "../content/examples/dnd-kit-backlog";

import { TooltipProvider } from "@registry/ui/tooltip";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

let cleanup: (() => Promise<void>) | undefined;

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("matchMedia", () => ({
    addEventListener() {},
    matches: true,
    removeEventListener() {},
  }));
});

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

const timeZone = "Europe/Berlin";
const today = Temporal.PlainDate.from("2026-10-08");

test("shows the backlog's tasks beside the week's meetings", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <TooltipProvider>
        <BacklogCalendar
          anchorDate={today}
          initialMeetings={sampleMeetings(today, timeZone)}
          initialTasks={sampleTasks}
          timeZone={timeZone}
        />
      </TooltipProvider>,
    ),
  );
  cleanup = async () => {
    await act(async () => root.unmount());
    container.remove();
  };

  const backlog = container.querySelector('[aria-label="Backlog"]')!;
  expect([...backlog.querySelectorAll("button")].map((card) => card.textContent)).toEqual([
    "Draft the report, 90 min",
    "Review the design, 45 min",
    "Call the bank, 30 min",
  ]);
  const titles = [...container.querySelectorAll("[data-event-id]")].map((event) =>
    event.getAttribute("data-event-id"),
  );
  expect(titles).toEqual(expect.arrayContaining(["standup", "interview", "planning"]));
});

test("the sample meetings fall in the week of today, and a task keeps its length", () => {
  const meetings = sampleMeetings(today, timeZone);
  const dates = meetings.map(({ start }) => start.toZonedDateTimeISO(timeZone).toPlainDate());

  expect(dates.map(String)).toEqual(["2026-10-05", "2026-10-06", "2026-10-08"]);
  const meeting = meetingFromTask(sampleTasks[1]!);
  expect(meeting).toMatchObject({ id: "task-review", title: "Review the design" });
  expect(meeting.start.until(meeting.end).total({ unit: "minutes" })).toBe(45);
});
