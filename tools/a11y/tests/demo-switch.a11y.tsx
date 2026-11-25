import { afterEach, describe, expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { App } from "../../../apps/demo/src/app";
import reactPage from "../../../apps/demo/index.html?raw";
import { setTheme } from "./axe";
import { render, until } from "./render";

/**
 * The demo's framework switch, React to Solid and back, keeps the view, the date and the theme: the
 * view and date in the link's search string, the theme in the storage both pages read before they
 * paint. The Solid demo is apps/demo-solid, which the test server serves at `/solid/`
 * (solid-demo.ts), in a frame of this origin.
 */

const themeKey = "moltenship-demo:theme";

/** Follows the link as a click does, up to the address, which the test opens itself. */
async function followed(link: HTMLAnchorElement, click: () => Promise<void> | void) {
  const view = link.ownerDocument.defaultView!;
  const stop = (event: MouseEvent) => event.preventDefault();
  // After the page's own handler, which brings the address up to date.
  view.addEventListener("click", stop, { once: true });
  await click();
  return new URL(link.href);
}

const linkNamed = (root: ParentNode, name: string) =>
  [...root.querySelectorAll<HTMLAnchorElement>('header [aria-label="Framework"] a')].find(
    (link) => link.textContent === name,
  )!;

/** The React page's own script that sets the theme before it paints (apps/demo/index.html). */
function runReactPrePaint() {
  const script = /<script>([\s\S]*?)<\/script>/u.exec(reactPage)![1]!;
  const element = document.createElement("script");
  element.textContent = script;
  // An inline script runs as it's added.
  document.head.append(element);
  element.remove();
}

function openSolid(href: string) {
  const frame = document.createElement("iframe");
  frame.dataset.demoSwitch = "";
  frame.src = href;
  frame.style.cssText =
    "position: fixed; inset: 0 auto auto 0; z-index: 2147483646; border: 0; width: 1280px; height: 800px";
  document.body.append(frame);
  return frame;
}

const solidReady = (frame: HTMLIFrameElement) =>
  frame.contentDocument?.querySelector("main [data-event-id]") != null;
const viewShown = (root: ParentNode) =>
  root.querySelector('header [role="combobox"]')?.textContent?.trim();
const title = (root: ParentNode) => root.querySelector("header")?.textContent ?? "";

afterEach(() => {
  document.querySelector("iframe[data-demo-switch]")?.remove();
  localStorage.clear();
  setTheme("light");
});

describe("the demo's framework switch", () => {
  test("React to Solid keeps the view, the date and the theme", async () => {
    localStorage.clear();
    setTheme("light");
    history.replaceState(null, "", "?view=week&date=2026-10-08");
    await render(<App />);
    document.body.focus();
    // The month view, a month on, in the dark theme.
    await userEvent.keyboard("m");
    await userEvent.keyboard("j");
    await userEvent.click(document.querySelector('[aria-label="Switch to dark theme"]')!);
    await until(() => expect(title(document)).toContain("November 2026"));

    const link = linkNamed(document, "Solid");
    const href = await followed(link, () => userEvent.click(link));
    expect(href.pathname).toBe("/solid/");
    expect(Object.fromEntries(href.searchParams)).toEqual({ date: "2026-11-08", view: "month" });
    expect(localStorage.getItem(themeKey)).toBe("dark");

    const frame = openSolid(href.pathname + href.search);
    await until(() => expect(solidReady(frame)).toBe(true));
    const solid = frame.contentDocument!;
    expect(solid.documentElement.classList.contains("dark")).toBe(true);
    expect(viewShown(solid)).toBe("Month");
    expect(title(solid)).toContain("November 2026");
  });

  test("Solid to React keeps the view, the date and the theme", async () => {
    localStorage.clear();
    localStorage.setItem(themeKey, "dark");
    const frame = openSolid("/solid/?view=week&date=2026-10-08");
    await until(() => expect(solidReady(frame)).toBe(true));
    const solid = frame.contentDocument!;
    const press = (key: string) =>
      solid.body.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key }));
    // The agenda, a period back, in the light theme.
    press("a");
    await until(() => expect(viewShown(solid)).toBe("Agenda"));
    press("k");
    solid.querySelector<HTMLElement>('[aria-label="Switch to light theme"]')!.click();
    await until(() => expect(solid.documentElement.classList.contains("dark")).toBe(false));

    const link = linkNamed(solid, "React");
    const href = await followed(link, () => link.click());
    expect(href.pathname).toBe("/");
    const search = Object.fromEntries(href.searchParams);
    expect(search.view).toBe("agenda");
    expect(search.date < "2026-10-08").toBe(true);
    expect(localStorage.getItem(themeKey)).toBe("light");
    const solidTitle = title(solid);
    frame.remove();

    document.documentElement.classList.add("dark");
    runReactPrePaint();
    history.replaceState(null, "", href.search);
    await render(<App />);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(viewShown(document)).toBe("Agenda");
    // The same period's title as the Solid page showed.
    const range = /[A-Z][a-z]{2} \d+ – [A-Z][a-z]{2} \d+, \d{4}|[A-Z][a-z]+ \d+ – \d+, \d{4}/u;
    expect(title(document).match(range)?.[0]).toBe(solidTitle.match(range)?.[0]);
  });
});
