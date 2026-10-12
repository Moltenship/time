// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, expect, test, vi } from "vite-plus/test";

import type { SaveResult } from "../app/(home)/examples/nextjs/actions";
import { TeamCalendar, type TeamCalendarProps } from "../app/(home)/examples/nextjs/team-calendar";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const { actions, push } = vi.hoisted(() => ({
  actions: {
    createMeeting: vi.fn<(times: { end: string; start: string }) => Promise<SaveResult>>(),
    moveMeeting:
      vi.fn<(times: { end: string; id: string; start: string }) => Promise<SaveResult>>(),
    saveTimeZone: vi.fn<(timeZone: string) => Promise<void>>(),
  },
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/examples/nextjs",
  useRouter: () => ({ push }),
}));
vi.mock("../app/(home)/examples/nextjs/actions", () => actions);

let cleanup: (() => Promise<void>) | undefined;

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("matchMedia", () => ({
    addEventListener() {},
    matches: true,
    removeEventListener() {},
  }));
});

beforeEach(() => {
  push.mockClear();
  for (const action of Object.values(actions)) action.mockReset();
});

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

// Wednesday, October 14, 2026, 09:00 to 10:30 in Berlin.
const props: TeamCalendarProps = {
  location: { date: "2026-10-14", view: "week" },
  meetings: [
    {
      color: "blue",
      end: "2026-10-14T08:30:00Z",
      id: "planning",
      start: "2026-10-14T07:00:00Z",
      title: "Weekly planning",
    },
  ],
  now: "2026-10-12T12:00:00Z",
  timeZone: "Europe/Berlin",
  timeZoneFromCookie: true,
};

async function render(location = props.location) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(<TeamCalendar {...props} location={location} />));
  cleanup = async () => {
    await act(async () => root.unmount());
    container.remove();
  };
  return container;
}

/** Lets microtasks, the actions' promises and the renders they cause run. */
async function settle() {
  await act(async () => {
    for (let tick = 0; tick < 5; tick += 1) await Promise.resolve();
  });
}

async function press(key: string) {
  await act(async () => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }),
    );
    await Promise.resolve();
  });
  await settle();
}

async function click(element: Element | null | undefined) {
  expect(element).toBeTruthy();
  await act(async () => (element as HTMLElement).click());
  await settle();
}

async function focusMeeting(container: HTMLElement, id: string) {
  await act(async () => container.querySelector<HTMLElement>(`[data-event-id="${id}"]`)!.focus());
}

const labelOf = (container: HTMLElement, id: string) =>
  container.querySelector(`[data-event-id="${id}"]`)?.getAttribute("aria-label");

test("Next pushes the next week's URL", async () => {
  const container = await render();
  await click(container.querySelector('[aria-label="Next period"]'));

  expect(push.mock.calls).toEqual([
    ["/examples/nextjs?view=week&date=2026-10-21", { scroll: false }],
  ]);
});

test("opening a day from the month view pushes one URL for the new view and date", async () => {
  const container = await render({ date: "2026-10-14", view: "month" });
  const day = [...container.querySelectorAll("[data-calendar-part='viewport'] button")].find(
    (button) => button.getAttribute("aria-label") === "Friday, October 16, 2026",
  );
  await click(day);

  expect(push.mock.calls).toEqual([
    ["/examples/nextjs?view=day&date=2026-10-16", { scroll: false }],
  ]);
});

test("a move the server refuses goes back, with the reason under the calendar", async () => {
  actions.moveMeeting.mockResolvedValue({ ok: false, reason: "in-the-past" });
  const container = await render();
  await focusMeeting(container, "planning");
  await press(" ");
  await press("ArrowRight");
  await press("Enter");

  expect(actions.moveMeeting).toHaveBeenCalledWith({
    end: "2026-10-15T08:30:00Z",
    id: "planning",
    start: "2026-10-15T07:00:00Z",
  });
  expect(labelOf(container, "planning")).toMatch(/^Weekly planning, Wednesday, October 14/);
  expect(container.querySelector("footer [role='status']")?.textContent).toBe(
    "Not saved: the server refuses meetings that start in the past.",
  );
});

test("a saved move stays where it was dropped", async () => {
  actions.moveMeeting.mockResolvedValue({ ok: true });
  const container = await render();
  await focusMeeting(container, "planning");
  await press(" ");
  await press("ArrowRight");
  await press("Enter");

  expect(labelOf(container, "planning")).toMatch(/^Weekly planning, Thursday, October 15/);
  expect(container.querySelector("footer [role='status']")?.textContent).toBe("");
});

test("a new meeting shows while it saves, and can't be moved until it has an ID", async () => {
  const saved = Promise.withResolvers<SaveResult>();
  actions.createMeeting.mockReturnValue(saved.promise);
  const container = await render();
  await focusMeeting(container, "planning");
  await press("Escape");
  await press("ArrowRight");
  await press(" ");
  await press("Enter");

  expect(actions.createMeeting).toHaveBeenCalledWith({
    end: "2026-10-15T08:00:00Z",
    start: "2026-10-15T07:00:00Z",
  });
  const pending = [...container.querySelectorAll("[data-event-id]")].find((element) =>
    element.getAttribute("aria-label")?.startsWith("New meeting, Thursday, October 15"),
  );
  expect(pending).toBeTruthy();

  await act(async () => (pending as HTMLElement).focus());
  await press(" ");
  await press("ArrowRight");
  await press("Enter");
  expect(actions.moveMeeting).not.toHaveBeenCalled();

  await act(async () => saved.resolve({ ok: true }));
  await settle();
});
