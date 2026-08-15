// @vitest-environment jsdom

import { StrictMode, act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test } from "vite-plus/test";

import { createCalendar } from "../src/index";
import "./setup";

interface TestEvent {
  readonly id: string;
}

interface TestResource {
  readonly id: string;
}

const Calendar = createCalendar<TestEvent, TestResource>();
const events = Object.freeze([{ id: "event-1" }]);
const resources = Object.freeze([{ id: "resource-1" }]);
const mountedRoots: Root[] = [];

async function mount(element: React.ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => root.render(element));
  return container;
}

afterEach(async () => {
  await act(async () => {
    for (const root of mountedRoots.splice(0)) {
      root.unmount();
    }
  });
  document.body.replaceChildren();
});

test("a controlled slice is current on the first render that receives new props", async () => {
  const renderHistory: string[] = [];

  function Probe() {
    const { state, actions } = Calendar.useCalendar();
    renderHistory.push(state.view);
    return <button onClick={() => actions.setView("week")}>{state.view}</button>;
  }

  function Harness() {
    const [view, setView] = useState("month");
    return (
      <Calendar.Root
        events={events}
        resources={resources}
        view={view}
        onViewChange={setView}
        defaultAnchorDate="2026-08-15"
      >
        <Probe />
      </Calendar.Root>
    );
  }

  const container = await mount(
    <StrictMode>
      <Harness />
    </StrictMode>,
  );
  const rendersBeforeChange = renderHistory.length;
  const button = container.querySelector("button");
  expect(button?.textContent).toBe("month");

  await act(async () => button?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

  expect(button?.textContent).toBe("week");
  expect(renderHistory.slice(rendersBeforeChange)).not.toContain("month");
});

test("a direct controlled prop change has no intermediate stale snapshot", async () => {
  const renderHistory: string[] = [];

  function Probe() {
    const { state } = Calendar.useCalendar();
    renderHistory.push(state.view);
    return <span>{state.view}</span>;
  }

  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);

  await act(async () =>
    root.render(
      <StrictMode>
        <Calendar.Root events={events} resources={resources} view="month" anchorDate="2026-08-15">
          <Probe />
        </Calendar.Root>
      </StrictMode>,
    ),
  );
  const rendersBeforeChange = renderHistory.length;

  await act(async () =>
    root.render(
      <StrictMode>
        <Calendar.Root events={events} resources={resources} view="week" anchorDate="2026-08-15">
          <Probe />
        </Calendar.Root>
      </StrictMode>,
    ),
  );

  expect(container.textContent).toBe("week");
  expect(renderHistory.slice(rendersBeforeChange)).toEqual(["week", "week"]);
});

test("two roots own isolated vanilla stores", async () => {
  function Controls({ id }: { readonly id: string }) {
    const { state, actions } = Calendar.useCalendar();
    return (
      <button data-testid={id} onClick={() => actions.setView("week")}>
        {state.view}
      </button>
    );
  }

  const container = await mount(
    <div>
      <Calendar.Root
        events={events}
        resources={resources}
        defaultView="month"
        defaultAnchorDate="2026-08-15"
      >
        <Controls id="first" />
      </Calendar.Root>
      <Calendar.Root
        events={events}
        resources={resources}
        defaultView="agenda"
        defaultAnchorDate="2026-08-16"
      >
        <Controls id="second" />
      </Calendar.Root>
    </div>,
  );
  const first = container.querySelector('[data-testid="first"]');
  const second = container.querySelector('[data-testid="second"]');

  await act(async () => first?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

  expect(first?.textContent).toBe("week");
  expect(second?.textContent).toBe("agenda");
});

test("unchanged state reuses the same immutable snapshot", async () => {
  const snapshots: object[] = [];

  function Probe({ marker }: { readonly marker: number }) {
    const { state } = Calendar.useCalendar();
    snapshots.push(state);
    return <span>{marker}</span>;
  }

  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);

  await act(async () =>
    root.render(
      <Calendar.Root events={events} resources={resources} view="month" anchorDate="2026-08-15">
        <Probe marker={1} />
      </Calendar.Root>,
    ),
  );
  const firstSnapshot = snapshots.at(-1);
  await act(async () =>
    root.render(
      <Calendar.Root events={events} resources={resources} view="month" anchorDate="2026-08-15">
        <Probe marker={2} />
      </Calendar.Root>,
    ),
  );

  expect(snapshots.at(-1)).toBe(firstSnapshot);
  expect(Object.isFrozen(snapshots.at(-1))).toBe(true);
});
