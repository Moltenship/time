import { act } from "react";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { commands, server } from "vite-plus/test/browser";

import { App } from "../../../apps/demo/src/app";
import type { MouseStep } from "../mouse";
import { nextFrame, render, until } from "./render";

/** The browser's own mouse, at a point in this page. */
const mouse = (step: MouseStep) =>
  (commands as unknown as { mouse(step: MouseStep): Promise<void> }).mouse(step);

// A test that fails mid-drag leaves the button down, which the next test's press would inherit.
afterEach(async () => {
  await mouse({ type: "up" });
});

type Point = { readonly x: number; readonly y: number };

const center = (element: Element): Point => {
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
};

/** Presses at `from`, moves past both layers' activation distance, then on to `to`, and lets go. */
async function drag(from: Point, to: Point) {
  await mouse({ type: "move", x: from.x, y: from.y });
  await mouse({ type: "down" });
  await mouse({ steps: 4, type: "move", x: from.x + 12, y: from.y + 6 });
  await mouse({ steps: 16, type: "move", x: to.x, y: to.y });
  await act(async () => {
    await nextFrame();
    await nextFrame();
  });
  await mouse({ type: "up" });
}

const taskCard = (title: string) =>
  [...document.querySelectorAll<HTMLElement>("aside li > button:first-child")].find((card) =>
    card.textContent?.startsWith(title),
  ) ?? null;
const taskList = () => document.querySelector<HTMLElement>("aside ul[aria-describedby]")!;
const eventOf = (id: string) =>
  document.querySelector<HTMLElement>(`[data-slot="time-grid-body"] [data-event-id="${id}"]`);

// The demo's sidebar of unscheduled tasks with real mouse drags: Chromium in `vp run a11y`, and
// Firefox and WebKit in `vp run browsers`.
describe(`the demo's unscheduled tasks in ${server.browser}`, () => {
  test("a task dragged onto the week becomes an event, and dragged back, a task again", async () => {
    localStorage.clear();
    history.replaceState(null, "", "?view=week");
    await render(<App />);
    const body = document.querySelector<HTMLElement>('[data-slot="time-grid-body"]')!;
    const column = () => body.querySelectorAll<HTMLElement>("[data-date]")[2]!;
    body.scrollTop = (column().offsetHeight * 8) / 24;
    await act(nextFrame);
    const box = column().getBoundingClientRect();

    await drag(center(taskCard("Call the dentist")!), {
      x: box.left + box.width / 2,
      y: box.top + (box.height * 11.1) / 24,
    });

    // The demo saves after a delay; the task leaves the list once its event is saved.
    await until(() => expect(eventOf("task-dentist")).not.toBeNull());
    await until(() => expect(taskCard("Call the dentist")).toBeNull());
    expect(eventOf("task-dentist")!.getAttribute("aria-label")).toMatch(/11:00\s–\s11:30/);

    // Back to the list: the task shows at once, and the event goes once the delete is saved.
    // The list mid-screen, scrolling the sidebar alone: `scrollIntoView` would scroll the runner's
    // page around this one too.
    const list = taskList();
    const aside = list.closest("aside")!;
    const shown = list.getBoundingClientRect();
    aside.scrollTop += shown.top + shown.height / 2 - innerHeight / 2;
    await act(nextFrame);
    await drag(center(eventOf("task-dentist")!), center(list));

    await until(() => expect(taskCard("Call the dentist")).not.toBeNull());
    await until(() => expect(eventOf("task-dentist")).toBeNull());
  });
});
