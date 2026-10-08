import { createHash } from "node:crypto";

import { JSDOM } from "jsdom";
import { createElement, act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";

import { DeterministicCalendarFixture, type CalendarFixtureEnvironment } from "../src/fixture";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

interface HydrationScenario {
  readonly serverEnvironment: CalendarFixtureEnvironment;
  readonly clientEnvironment: CalendarFixtureEnvironment;
  readonly interact: boolean;
}

export interface SsrSmokeReport {
  readonly serverHtmlSha256: string;
  readonly recoverableErrors: readonly string[];
  readonly hydratedWithoutMutation: boolean;
  readonly interactionCount: number;
  readonly unmounted: boolean;
  readonly environment: CalendarFixtureEnvironment;
}

const domGlobalNames = [
  "document",
  "Element",
  "Event",
  "HTMLElement",
  "MouseEvent",
  "MutationObserver",
  "Node",
  "navigator",
  "self",
  "window",
] as const;

type DomGlobalName = (typeof domGlobalNames)[number];

function installDomGlobals(dom: JSDOM): () => void {
  const descriptors = new Map<DomGlobalName, PropertyDescriptor | undefined>();
  const actEnvironmentDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "IS_REACT_ACT_ENVIRONMENT",
  );
  const values: Record<DomGlobalName, unknown> = {
    document: dom.window.document,
    Element: dom.window.Element,
    Event: dom.window.Event,
    HTMLElement: dom.window.HTMLElement,
    MouseEvent: dom.window.MouseEvent,
    MutationObserver: dom.window.MutationObserver,
    Node: dom.window.Node,
    navigator: dom.window.navigator,
    self: dom.window,
    window: dom.window,
  };

  for (const name of domGlobalNames) {
    descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value: values[name],
    });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  return () => {
    if (actEnvironmentDescriptor) {
      Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", actEnvironmentDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
    }
    for (const name of domGlobalNames) {
      const descriptor = descriptors.get(name);
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
    dom.window.close();
  };
}

function fixtureElement(environment: CalendarFixtureEnvironment) {
  return createElement(DeterministicCalendarFixture, { environment });
}

export async function runHydrationScenario({
  serverEnvironment,
  clientEnvironment,
  interact,
}: HydrationScenario): Promise<SsrSmokeReport> {
  if (typeof window !== "undefined" || typeof document !== "undefined") {
    throw new Error("SSR smoke must begin without browser globals");
  }

  const serverHtml = renderToString(fixtureElement(serverEnvironment), {
    identifierPrefix: serverEnvironment.identifierPrefix,
  });
  const dom = new JSDOM(`<div id="root">${serverHtml}</div>`, {
    url: "https://ssr-fixture.invalid/",
  });
  const container = dom.window.document.querySelector<HTMLElement>("#root");
  if (!container) {
    dom.window.close();
    throw new Error("SSR fixture root was not created");
  }
  const restoreGlobals = installDomGlobals(dom);
  const recoverableErrors: string[] = [];
  const initialHtml = container.innerHTML;
  let root: Root | null = null;
  let hydratedWithoutMutation = false;
  let interactionCount = -1;
  let unmounted = false;

  try {
    await act(async () => {
      root = hydrateRoot(container, fixtureElement(clientEnvironment), {
        identifierPrefix: clientEnvironment.identifierPrefix,
        onRecoverableError: (error) =>
          recoverableErrors.push(error instanceof Error ? error.message : String(error)),
      });
      await Promise.resolve();
    });
    hydratedWithoutMutation = container.innerHTML === initialHtml;

    if (interact) {
      const button = container.querySelector<HTMLButtonElement>("button");
      if (!button) throw new Error("Hydrated fixture did not render its interaction button");
      await act(async () => button.click());
    }

    const output = container.querySelector<HTMLOutputElement>("[data-interaction-count]");
    interactionCount = Number(output?.textContent);
    await act(async () => root?.unmount());
    root = null;
    unmounted = container.childNodes.length === 0;
  } finally {
    if (root) await act(async () => root?.unmount());
    restoreGlobals();
  }

  return {
    serverHtmlSha256: createHash("sha256").update(serverHtml).digest("hex"),
    recoverableErrors,
    hydratedWithoutMutation,
    interactionCount,
    unmounted,
    environment: serverEnvironment,
  };
}
