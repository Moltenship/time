// @vitest-environment jsdom

import { describe, expect, test } from "vite-plus/test";

import { shortcutCommand } from "../src/shortcuts";

function press(key: string, target: HTMLElement = document.body, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { bubbles: true, key, ...init });
  Object.defineProperty(event, "target", { value: target });
  return shortcutCommand(event);
}

function element(html: string) {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  return host.querySelector<HTMLElement>("[data-target]") ?? host;
}

describe("keyboard shortcuts", () => {
  test.each([
    ["t", { type: "today" }],
    ["d", { type: "view", view: "day" }],
    ["w", { type: "view", view: "week" }],
    ["m", { type: "view", view: "month" }],
    ["y", { type: "view", view: "year" }],
    ["a", { type: "view", view: "agenda" }],
    ["j", { type: "next" }],
    ["ArrowRight", { type: "next" }],
    ["k", { type: "previous" }],
    ["ArrowLeft", { type: "previous" }],
    ["c", { type: "create" }],
  ])("maps %s", (key, command) => {
    expect(press(key)).toEqual(command);
  });

  test("maps ? whether or not the layout needs Shift for it", () => {
    expect(press("?")).toEqual({ type: "help" });
    expect(press("?", document.body, { shiftKey: true })).toEqual({ type: "help" });
  });

  test("ignores modified keys, unknown keys, and inherited object keys", () => {
    expect(press("t", document.body, { metaKey: true })).toBeUndefined();
    expect(press("T", document.body, { shiftKey: true })).toBeUndefined();
    expect(press("x")).toBeUndefined();
    expect(press("constructor")).toBeUndefined();
  });

  test("stays out of text fields, dialogs and listboxes", () => {
    expect(press("t", element("<input data-target />"))).toBeUndefined();
    expect(press("t", element("<textarea data-target></textarea>"))).toBeUndefined();
    expect(
      press("t", element('<div role="dialog"><button data-target>Edit</button></div>')),
    ).toBeUndefined();
    expect(
      press("j", element('<div role="listbox"><div data-target>Week</div></div>')),
    ).toBeUndefined();
  });
});
