// @vitest-environment jsdom

import { Activity, StrictMode, act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test, vi } from "vite-plus/test";

import {
  createCalendarStore,
  useCalendarStore,
  useCalendarStoreBinding,
  useCalendarStoreSelector,
  type CalendarActions,
  type CalendarStore,
} from "../src/index.ts";
import { getCalendarRuntime } from "../src/internal/runtime-store.ts";
import "./setup.ts";

type ViewName = "agenda" | "month" | "week";
type TestStore = CalendarStore<ViewName, string, string, string>;

const mountedRoots: Root[] = [];
const stores: TestStore[] = [];
const defaults = {
  defaultAnchorDate: Temporal.PlainDate.from("2026-08-15"),
  defaultTimeZone: "Asia/Tbilisi",
  defaultView: "month" as ViewName,
};

function makeStore(defaultView: ViewName = "month"): TestStore {
  const store = createCalendarStore<ViewName, string, string, string>({
    ...defaults,
    defaultView,
  });
  stores.push(store);
  return store;
}

async function mount(element: React.ReactNode): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => root.render(element));
  return container;
}

afterEach(async () => {
  await act(async () => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  for (const store of stores.splice(0)) store.destroy();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

test("controlled values are current in the first render that receives them", async () => {
  const renderHistory: ViewName[] = [];

  function Harness() {
    const [view, setView] = useState<ViewName>("month");
    const store = useCalendarStore<ViewName, string, string, string>(defaults);
    const calendar = useCalendarStoreBinding(store, {
      controlled: { view },
      handlers: { onViewChange: setView },
    });
    renderHistory.push(calendar.state.view);
    return <button onClick={() => calendar.actions.setView("week")}>{calendar.state.view}</button>;
  }

  const container = await mount(
    <StrictMode>
      <Harness />
    </StrictMode>,
  );
  const rendersBeforeChange = renderHistory.length;
  const button = container.querySelector("button");

  await act(async () => button?.click());

  expect(button?.textContent).toBe("week");
  expect(renderHistory.slice(rendersBeforeChange)).not.toContain("month");
});

test("stable actions call the latest committed controlled handler", async () => {
  const firstHandler = vi.fn();
  const secondHandler = vi.fn();
  const actionHistory: CalendarActions<ViewName, string, string, string>[] = [];

  function Harness({ onViewChange }: { readonly onViewChange: (next: ViewName) => void }) {
    const store = useCalendarStore<ViewName, string, string, string>(defaults);
    const calendar = useCalendarStoreBinding(store, {
      controlled: { view: "month" },
      handlers: { onViewChange },
    });
    actionHistory.push(calendar.actions);
    return <button onClick={() => calendar.actions.setView("week")}>change</button>;
  }

  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => root.render(<Harness onViewChange={firstHandler} />));
  const firstActions = actionHistory.at(-1);
  await act(async () => root.render(<Harness onViewChange={secondHandler} />));

  expect(actionHistory.at(-1)).toBe(firstActions);
  await act(async () => container.querySelector("button")?.click());
  expect(firstHandler).not.toHaveBeenCalled();
  expect(secondHandler).toHaveBeenCalledWith("week", expect.objectContaining({ controlled: true }));
});

test("a selector does not render for an unrelated slice", async () => {
  const store = makeStore();
  let renderCount = 0;
  const selectView = (state: ReturnType<TestStore["getSnapshot"]>) => state.view;

  function ViewProbe() {
    const view = useCalendarStoreSelector(store, selectView);
    renderCount += 1;
    return <output>{view}</output>;
  }

  const container = await mount(<ViewProbe />);
  const initialRenderCount = renderCount;

  await act(async () => store.actions.setAnchorDate(Temporal.PlainDate.from("2026-08-16")));
  expect(renderCount).toBe(initialRenderCount);

  await act(async () => store.actions.setView("week"));
  expect(renderCount).toBe(initialRenderCount + 1);
  expect(container.querySelector("output")?.textContent).toBe("week");
});

test("two React roots own isolated stores", async () => {
  function Controls({ defaultView, id }: { readonly defaultView: ViewName; readonly id: string }) {
    const store = useCalendarStore<ViewName, string, string, string>({
      ...defaults,
      defaultView,
    });
    const calendar = useCalendarStoreBinding(store);
    return (
      <button data-testid={id} onClick={() => calendar.actions.setView("week")}>
        {calendar.state.view}
      </button>
    );
  }

  const container = await mount(
    <div>
      <Controls defaultView="month" id="first" />
      <Controls defaultView="agenda" id="second" />
    </div>,
  );
  const first = container.querySelector<HTMLButtonElement>('[data-testid="first"]');
  const second = container.querySelector<HTMLButtonElement>('[data-testid="second"]');

  await act(async () => first?.click());
  expect(first?.textContent).toBe("week");
  expect(second?.textContent).toBe("agenda");
});

test("unmount cleans subscriptions without destroying an injected store", async () => {
  const injected = makeStore();
  const unsubscribe = vi.fn();
  const subscription = vi
    .spyOn(getCalendarRuntime(injected).jotaiStore, "sub")
    .mockReturnValue(unsubscribe);

  function Harness({ store }: { readonly store?: TestStore }) {
    const current = useCalendarStore<ViewName, string, string, string>(defaults, store);
    const calendar = useCalendarStoreBinding(current);
    return <span>{calendar.state.view}</span>;
  }

  const injectedContainer = document.createElement("div");
  const injectedRoot = createRoot(injectedContainer);
  await act(async () => injectedRoot.render(<Harness store={injected} />));
  expect(subscription).toHaveBeenCalledOnce();
  await act(async () => injectedRoot.unmount());
  expect(unsubscribe).toHaveBeenCalledOnce();
  await act(async () => injected.actions.setView("week"));
  expect(injected.getSnapshot().view).toBe("week");
  expect(injected.meta.destroyed).toBe(false);
});

test("Activity hide and reveal preserve an owned store while disconnecting subscriptions", async () => {
  let owned: TestStore | undefined;
  const observedStores: TestStore[] = [];
  const unsubscribe = vi.fn();
  let subscription: ReturnType<typeof vi.fn> | undefined;

  function Harness() {
    const current = useCalendarStore<ViewName, string, string, string>(defaults);
    observedStores.push(current);
    if (owned === undefined) {
      owned = current;
      subscription = vi
        .spyOn(getCalendarRuntime(current).jotaiStore, "sub")
        .mockReturnValue(unsubscribe);
    }
    const calendar = useCalendarStoreBinding(current);
    return <span>{calendar.state.view}</span>;
  }

  const ownedContainer = document.createElement("div");
  const ownedRoot = createRoot(ownedContainer);
  await act(async () =>
    ownedRoot.render(
      <Activity mode="visible">
        <Harness />
      </Activity>,
    ),
  );
  expect(subscription).toHaveBeenCalledOnce();
  expect(owned?.meta.destroyed).toBe(false);

  await act(async () => owned?.actions.setView("week"));
  await act(async () =>
    ownedRoot.render(
      <Activity mode="hidden">
        <Harness />
      </Activity>,
    ),
  );
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(owned?.meta.destroyed).toBe(false);

  await act(async () =>
    ownedRoot.render(
      <Activity mode="visible">
        <Harness />
      </Activity>,
    ),
  );
  expect(subscription).toHaveBeenCalledTimes(2);
  expect(observedStores.every((store) => store === owned)).toBe(true);
  expect(owned?.getSnapshot().view).toBe("week");
  expect(ownedContainer.querySelector("span")?.textContent).toBe("week");
  expect(owned?.meta.destroyed).toBe(false);

  await act(async () => ownedRoot.unmount());
  expect(unsubscribe).toHaveBeenCalledTimes(2);
  expect(owned?.meta.destroyed).toBe(false);
});
