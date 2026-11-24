// @vitest-environment jsdom

import { createComponent } from "@solidjs/web";
import { createMemo, createRoot, createSignal, flush, Loading } from "solid-js";
import { describe, expect, test } from "vite-plus/test";

import { when } from "../src/flow";
import { element } from "../src/props";
import { createStateSelector } from "../src/state-selector";
import { mount, settled } from "./harness/render";
import { createTestStore } from "./harness/store";
import "./setup";

interface State {
  readonly count: number;
  readonly label: string;
  readonly items: readonly string[];
}

const initial: State = { count: 0, label: "a", items: ["x"] };
const Span = element("span");

describe("createStateSelector", () => {
  test("reads the selection now and after the store changes, once Solid flushes", () => {
    const store = createTestStore(initial);
    createRoot((dispose) => {
      const count = createStateSelector(store, (state) => state.count);
      expect(count()).toBe(0);
      store.set({ ...initial, count: 1 });
      // Solid 2.0 applies writes on its next flush, so the accessor still reads the old value.
      expect(count()).toBe(0);
      flush();
      expect(count()).toBe(1);
      dispose();
    });
  });

  test("re-runs what reads it only when the selection changes", async () => {
    const store = createTestStore(initial);
    let runs = 0;
    const view = mount(() => {
      const label = createStateSelector(store, (state) => state.label);
      return createComponent(Span, {
        get children() {
          runs += 1;
          return label();
        },
      });
    });
    expect(view.container.textContent).toBe("a");
    expect(runs).toBe(1);

    store.set({ ...initial, count: 5 });
    await settled();
    expect(runs).toBe(1);

    store.set({ ...initial, count: 5, label: "b" });
    await settled();
    expect(view.container.textContent).toBe("b");
    expect(runs).toBe(2);
  });

  test("keeps the previous selection while isEqual says it's the same", () => {
    const store = createTestStore(initial);
    createRoot((dispose) => {
      const items = createStateSelector(store, (state) => [...state.items], {
        isEqual: (left, right) =>
          left.length === right.length && left.every((item, index) => item === right[index]),
      });
      let runs = 0;
      const observed = createMemo(() => {
        runs += 1;
        return items();
      });
      const first = observed();
      store.set({ ...initial, count: 1 });
      flush();
      expect(observed()).toBe(first);
      expect(runs).toBe(1);

      store.set({ ...initial, items: ["x", "y"] });
      flush();
      expect(observed()).toEqual(["x", "y"]);
      expect(runs).toBe(2);
      dispose();
    });
  });

  test("re-selects when a signal or prop the selector reads changes", async () => {
    const store = createTestStore({ ...initial, items: ["x", "y", "z"] });
    const [index, setIndex] = createSignal(0);
    const view = mount(() =>
      createComponent(Item, {
        get index() {
          return index();
        },
      }),
    );
    function Item(props: { readonly index: number }) {
      const item = createStateSelector(store, (state) => state.items[props.index]);
      return createComponent(Span, {
        get children() {
          return item();
        },
      });
    }
    expect(view.container.textContent).toBe("x");
    setIndex(2);
    await settled();
    expect(view.container.textContent).toBe("z");
  });

  test("unsubscribes when its owner is disposed", async () => {
    const store = createTestStore(initial);
    const [shown, setShown] = createSignal(true);
    mount(() =>
      when(shown, () => {
        const count = createStateSelector(store, (state) => state.count);
        return createComponent(Span, {
          get children() {
            return count();
          },
        });
      }),
    );
    expect(store.listeners).toBe(1);
    setShown(false);
    await settled();
    expect(store.listeners).toBe(0);

    createRoot((dispose) => {
      createStateSelector(store, (state) => state.count);
      createStateSelector(store, (state) => state.label);
      expect(store.listeners).toBe(2);
      dispose();
    });
    expect(store.listeners).toBe(0);
  });

  test("hears the store after the source changes to another view of the same store", async () => {
    const store = createTestStore(initial);
    // Two sources over one store share its listener set, as a root's sources do when a controlled
    // slice changes. Solid runs the old subscription's cleanup after the new one subscribes.
    const viewOf = (prefix: string) => ({
      getSnapshot: () => ({
        ...store.getSnapshot(),
        label: `${prefix}${store.getSnapshot().label}`,
      }),
      subscribe: store.subscribe,
    });
    const [source, setSource] = createSignal(viewOf("first "));
    const view = mount(() => {
      const label = createStateSelector(source, (state) => state.label, {});
      return createComponent(Span, {
        get children() {
          return label();
        },
      });
    });
    setSource(viewOf("second "));
    await settled();
    expect(view.container.textContent).toBe("second a");
    expect(store.listeners).toBe(1);

    store.set({ ...initial, label: "b" });
    await settled();
    expect(view.container.textContent).toBe("second b");
  });

  test("under a held transition, keeps the source on screen subscribed and lets go of one superseded", async () => {
    const stores = {
      first: createTestStore({ ...initial, label: "first" }),
      second: createTestStore({ ...initial, label: "second" }),
      third: createTestStore({ ...initial, label: "third" }),
    };
    type Key = keyof typeof stores;
    const [key, setKey] = createSignal<Key>("first");
    const waiting: (() => void)[] = [];
    // Something async that reads the same key holds each change of it in a transition.
    const slow = createMemo(async () => {
      const current = key();
      await new Promise<void>((resolve) => waiting.push(resolve));
      return current;
    });
    const listeners = () =>
      `${stores.first.listeners} ${stores.second.listeners} ${stores.third.listeners}`;
    const release = async () => {
      for (const resolve of waiting.splice(0)) resolve();
      await settled();
      await settled();
    };
    const view = mount(() => {
      const label = createStateSelector(
        () => stores[key()],
        (state) => state.label,
      );
      return createComponent(Loading, {
        fallback: "loading",
        get children() {
          return createComponent(Span, {
            get children() {
              return `${label()} ${slow()}`;
            },
          });
        },
      });
    });
    await release();
    expect(view.container.textContent).toBe("first first");
    expect(listeners()).toBe("1 0 0");

    setKey("second");
    await settled();
    // The screen still shows the first source, which stays subscribed while the change is held.
    expect(view.container.textContent).toBe("first first");
    // The held run subscribed to the second, so a change there isn't missed once it lands.
    expect(listeners()).toBe("1 1 0");

    setKey("third");
    await settled();
    // The run for the second source never reached the screen; it let go when superseded.
    expect(listeners()).toBe("1 0 1");

    await release();
    expect(view.container.textContent).toBe("third third");
    expect(listeners()).toBe("0 0 1");

    stores.third.set({ ...initial, label: "third, later" });
    await settled();
    expect(view.container.textContent).toBe("third, later third");
  });

  test("takes a change the store makes while Solid computes", async () => {
    const store = createTestStore(initial);
    const [count, setCount] = createSignal(0);
    const view = mount(() => {
      const selected = createStateSelector(store, (state) => state.count);
      // A store that syncs from a prop notifies inside a computation, where Solid 2.0 refuses
      // writes by default.
      createMemo(() => {
        const next = count();
        if (next !== store.getSnapshot().count) store.set({ ...initial, count: next });
        return next;
      });
      return createComponent(Span, {
        get children() {
          return selected();
        },
      });
    });
    setCount(3);
    await settled();
    expect(view.container.textContent).toBe("3");
  });

  test("reads the client snapshot in a client-only render, even with a server snapshot", () => {
    const store = createTestStore({ ...initial, label: "client" }, { ...initial, label: "server" });
    const view = mount(() => {
      const label = createStateSelector(store, (state) => state.label);
      return createComponent(Span, {
        get children() {
          return label();
        },
      });
    });
    expect(view.container.textContent).toBe("client");
  });
});
