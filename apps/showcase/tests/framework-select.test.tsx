// @vitest-environment jsdom

import { FrameworkProvider } from "fumadocs-core/framework";
import { SidebarProvider } from "fumadocs-ui/components/sidebar/base";
import { TreeContextProvider } from "fumadocs-ui/contexts/tree";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, test } from "vite-plus/test";

import { FrameworkSelect, frameworkOptions } from "@/components/framework-select";
import { frameworkCookie } from "@/lib/frameworks";
import { rememberFramework, rememberedFramework } from "@/lib/remembered-framework";

// The select at the top of the docs' sidebar: where each option leads, what it tells a screen
// reader, and that it remembers the framework being read.

const pages = {
  react: [
    "/docs/react",
    "/docs/react/quick-start",
    "/docs/react/api",
    "/docs/react/api/components",
    "/docs/react/api/store",
    "/docs/react/views/month",
  ],
  solid: [
    "/docs/solid",
    "/docs/solid/quick-start",
    "/docs/solid/api",
    "/docs/solid/api/components",
  ],
};

const urls = (pathname: string, current: "react" | "solid") =>
  Object.fromEntries(
    frameworkOptions(pathname, current, pages).map((option) => [option.title, option.url]),
  );

describe("the options", () => {
  test("there is one for each framework, with its name and its logo", () => {
    const options = frameworkOptions("/docs/react", "react", pages);
    expect(options.map((option) => option.title)).toEqual(["React", "Solid"]);
    for (const option of options) expect(option.icon).toBeTruthy();
  });

  test("the other framework's option leads to the same page", () => {
    expect(urls("/docs/react/quick-start", "react")).toEqual({
      React: "/docs/react/quick-start",
      Solid: "/docs/solid/quick-start",
    });
    expect(urls("/docs/solid/api/components", "solid")).toEqual({
      React: "/docs/react/api/components",
      Solid: "/docs/solid/api/components",
    });
  });

  test("or to the nearest page above it, when that framework lacks the page", () => {
    expect(urls("/docs/react/api/store", "react").Solid).toBe("/docs/solid/api");
    expect(urls("/docs/react/views/month", "react").Solid).toBe("/docs/solid");
  });

  test("the same page keeps the heading the reader is at", () => {
    const options = frameworkOptions("/docs/react/quick-start", "react", pages, "#render-it");
    expect(options.map((option) => option.url)).toEqual([
      "/docs/react/quick-start#render-it",
      "/docs/solid/quick-start#render-it",
    ]);
  });

  test("a page that stands in for the one being read opens at its top", () => {
    const [react, solid] = frameworkOptions("/docs/react/api/store", "react", pages, "#selectors");
    expect(react?.url).toBe("/docs/react/api/store#selectors");
    expect(solid?.url).toBe("/docs/solid/api");
  });

  test("the selected option is marked, and leads where the reader is", () => {
    const [react, solid] = frameworkOptions("/docs/solid/quick-start", "solid", pages);
    expect(solid?.props?.["aria-current"]).toBe("page");
    expect(solid?.url).toBe("/docs/solid/quick-start");
    expect(react?.props?.["aria-current"]).toBeUndefined();
  });
});

let root: Root | undefined;
let host: HTMLElement | undefined;

beforeAll(() => {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  // jsdom has no media queries. The sidebar asks for the width, to be a drawer on a phone.
  window.matchMedia ??= (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  });
});

beforeEach(() => {
  document.cookie = `${frameworkCookie}=; path=/; max-age=0`;
  window.history.replaceState(null, "", window.location.pathname);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

/** The select as the docs layout renders it, on the page at `pathname`. */
function renderAt(pathname: string, framework: "react" | "solid") {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      <FrameworkProvider
        usePathname={() => pathname}
        useParams={() => ({})}
        useRouter={() => ({ push() {}, refresh() {} })}
      >
        <TreeContextProvider tree={{ name: "Docs", children: [] }}>
          <SidebarProvider>
            <FrameworkSelect framework={framework} pages={pages} />
          </SidebarProvider>
        </TreeContextProvider>
      </FrameworkProvider>,
    );
  });
  const button = host.querySelector("button");
  if (button === null) throw new Error("The select rendered no button.");
  return button;
}

function open(button: HTMLButtonElement) {
  act(() => button.click());
  return [...document.querySelectorAll<HTMLAnchorElement>("a[href^='/docs/']")];
}

describe("the select", () => {
  test("names the framework being read, and shows its logo", () => {
    const button = renderAt("/docs/react/quick-start", "react");
    expect(button.getAttribute("aria-label")).toBe("Framework: React");
    expect(button.textContent).toBe("React");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.querySelector("svg[aria-hidden='true']")).not.toBeNull();
    // Closed, it holds no link for the keyboard to stop at.
    expect(document.querySelector("a[href^='/docs/']")).toBeNull();
  });

  test("opens a list of links, one for each framework, to the page being read", () => {
    const button = renderAt("/docs/react/quick-start", "react");
    const links = open(button);

    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["React", "/docs/react/quick-start"],
      ["Solid", "/docs/solid/quick-start"],
    ]);
    expect(links.map((link) => link.getAttribute("aria-current"))).toEqual(["page", null]);
  });

  test("the list it opens has a name, since a popover is a dialog to a screen reader", () => {
    open(renderAt("/docs/react/quick-start", "react"));
    const popover = document.querySelector("[role='dialog']");
    expect(popover?.getAttribute("aria-label")).toBe("Framework");
    expect(popover?.querySelectorAll("a")).toHaveLength(2);
  });

  test("in Solid's docs it names Solid, and React's link leads back to the same page", () => {
    const button = renderAt("/docs/solid/api/components", "solid");
    expect(button.getAttribute("aria-label")).toBe("Framework: Solid");

    const links = open(button);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/docs/react/api/components",
      "/docs/solid/api/components",
    ]);
    expect(links.map((link) => link.getAttribute("aria-current"))).toEqual([null, "page"]);
  });

  test("the links keep the address's hash, as it is when the list opens", () => {
    const button = renderAt("/docs/react/quick-start", "react");
    // A click in the table of contents changes the hash and renders nothing.
    window.history.replaceState(null, "", "#render-it");
    expect(open(button).map((link) => link.getAttribute("href"))).toEqual([
      "/docs/react/quick-start#render-it",
      "/docs/solid/quick-start#render-it",
    ]);

    act(() => button.click());
    window.history.replaceState(null, "", "#next-steps");
    expect(open(button)[1]?.getAttribute("href")).toBe("/docs/solid/quick-start#next-steps");
  });

  test("a page Solid lacks leads to the nearest one it has", () => {
    const links = open(renderAt("/docs/react/api/store", "react"));
    expect(links[1]?.getAttribute("href")).toBe("/docs/solid/api");
  });

  test("the logos are decoration: the options' names are their text", () => {
    const links = open(renderAt("/docs/react", "react"));
    for (const link of links) {
      for (const logo of link.querySelectorAll("svg")) {
        expect(logo.getAttribute("aria-hidden")).toBe("true");
      }
    }
  });

  test("remembers the framework being read", () => {
    expect(rememberedFramework()).toBeUndefined();
    renderAt("/docs/solid/quick-start", "solid");
    expect(rememberedFramework()).toBe("solid");
  });
});

describe("the remembered framework", () => {
  test("is a cookie the server can read, for the whole site", () => {
    rememberFramework("solid");
    expect(document.cookie).toContain(`${frameworkCookie}=solid`);
    rememberFramework("react");
    expect(rememberedFramework()).toBe("react");
    expect(document.cookie).not.toContain(`${frameworkCookie}=solid`);
  });

  test("is nothing until a reader opens either set, or when the cookie holds another value", () => {
    expect(rememberedFramework()).toBeUndefined();
    document.cookie = `${frameworkCookie}=vue; path=/`;
    expect(rememberedFramework()).toBeUndefined();
  });
});
