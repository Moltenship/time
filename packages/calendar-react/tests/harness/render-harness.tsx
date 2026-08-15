import { StrictMode, act, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";

export interface ReactRootHarness {
  readonly container: HTMLDivElement;
  readonly recoverableErrors: readonly unknown[];
  readonly unmounted: boolean;
  dispose(): Promise<void>;
  render(element: ReactNode): Promise<void>;
  unmount(): Promise<void>;
}

export interface ReactHydrationHarness extends ReactRootHarness {
  readonly hydratedWithoutMutation: boolean;
  readonly serverMarkup: string;
}

export interface SuspensionGate {
  readonly pending: boolean;
  read(): void;
  release(): void;
}

interface HarnessOptions {
  readonly identifierPrefix?: string;
  readonly strictMode?: boolean;
}

interface HydrationHarnessOptions extends HarnessOptions {
  readonly clientElement?: ReactNode;
}

function wrap(element: ReactNode, strictMode: boolean): ReactNode {
  return strictMode ? <StrictMode>{element}</StrictMode> : element;
}

function createContainer(): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  return container;
}

export function createSuspensionGate(): SuspensionGate {
  let pending = true;
  let resolve: (() => void) | undefined;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return Object.freeze({
    get pending() {
      return pending;
    },
    read() {
      if (pending) throw promise;
    },
    release() {
      if (!pending) return;
      pending = false;
      resolve?.();
    },
  });
}

function createHarness(
  container: HTMLDivElement,
  root: Root,
  recoverableErrors: readonly unknown[],
  strictMode: boolean,
): ReactRootHarness {
  let mounted = true;

  async function unmount(): Promise<void> {
    if (!mounted) return;
    await act(async () => root.unmount());
    mounted = false;
  }

  return Object.freeze({
    container,
    async dispose() {
      await unmount();
      container.remove();
    },
    recoverableErrors,
    async render(element: ReactNode) {
      if (!mounted) throw new Error("react-test-harness-unmounted");
      await act(async () => root.render(wrap(element, strictMode)));
    },
    get unmounted() {
      return !mounted;
    },
    unmount,
  });
}

export async function renderWithHarness(
  element: ReactNode,
  options: HarnessOptions = {},
): Promise<ReactRootHarness> {
  const { identifierPrefix, strictMode = false } = options;
  const container = createContainer();
  const recoverableErrors: unknown[] = [];
  const root = createRoot(container, {
    identifierPrefix,
    onRecoverableError: (error) => recoverableErrors.push(error),
  });
  const harness = createHarness(container, root, recoverableErrors, strictMode);
  await harness.render(element);
  return harness;
}

export async function hydrateWithHarness(
  serverElement: ReactNode,
  options: HydrationHarnessOptions = {},
): Promise<ReactHydrationHarness> {
  const { clientElement = serverElement, identifierPrefix, strictMode = false } = options;
  const serverMarkup = renderToString(wrap(serverElement, strictMode), { identifierPrefix });
  const container = createContainer();
  container.innerHTML = serverMarkup;
  const initialMarkup = container.innerHTML;
  const recoverableErrors: unknown[] = [];
  let root: Root | undefined;

  await act(async () => {
    root = hydrateRoot(container, wrap(clientElement, strictMode), {
      identifierPrefix,
      onRecoverableError: (error) => recoverableErrors.push(error),
    });
    await Promise.resolve();
  });

  if (root === undefined) throw new Error("react-hydration-root-not-created");
  const harness = createHarness(container, root, recoverableErrors, strictMode);

  return Object.freeze({
    container: harness.container,
    dispose: () => harness.dispose(),
    hydratedWithoutMutation: container.innerHTML === initialMarkup,
    recoverableErrors: harness.recoverableErrors,
    render: (element: ReactNode) => harness.render(element),
    serverMarkup,
    get unmounted() {
      return harness.unmounted;
    },
    unmount: () => harness.unmount(),
  });
}
