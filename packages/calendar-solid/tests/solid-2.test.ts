// @vitest-environment jsdom

// What Solid 2.0 does differently from 1.x that the adapter relies on, pinned so an upgrade that
// changes it fails here first.

import { createComponent } from "@solidjs/web";
import {
  createContext,
  createEffect,
  createMemo,
  createRoot,
  createSignal,
  flush,
  For,
  merge,
  omit,
  onCleanup,
  onSettled,
  useContext,
  type Accessor,
  type Component,
} from "solid-js";
import { describe, expect, test } from "vite-plus/test";

import { element } from "../src/props";
import { mount, settled } from "./harness/render";
import { recoverFromRenderError, takeConsoleMessages } from "./setup";

const Span = element("span");

interface ForProps {
  readonly each: readonly string[];
  readonly children: (item: string, index: Accessor<number>) => null;
}

describe("Solid 2.0", () => {
  test("applies a write on the next flush, not at once", async () => {
    const [count, setCount] = createSignal(0);
    setCount(1);
    expect(count()).toBe(0);
    flush();
    expect(count()).toBe(1);
    setCount(2);
    await Promise.resolve();
    expect(count()).toBe(2);
  });

  test("warns about a prop read in a component's body, which never updates", async () => {
    const [label, setLabel] = createSignal("a");
    function Label(props: { readonly label: string }) {
      const frozen = props.label;
      return createComponent(Span, { children: frozen });
    }
    const view = mount(() =>
      createComponent(Label, {
        get label() {
          return label();
        },
      }),
    );
    expect(takeConsoleMessages().join("\n")).toMatch(/STRICT_READ_UNTRACKED|untracked/i);
    setLabel("b");
    await settled();
    expect(view.container.textContent).toBe("a");
  });

  test("refuses a write inside a computation unless the signal opts in", async () => {
    createRoot((dispose) => {
      const [strict, setStrict] = createSignal(0);
      const [owned, setOwned] = createSignal(0, { ownedWrite: true });
      createMemo(() => {
        setOwned(1);
        return 0;
      });
      // In development the write throws inside the memo, which then rethrows when it's read, and
      // the write never lands.
      const refused = createMemo(() => {
        setStrict(1);
        return 0;
      });
      expect(refused).toThrow(/REACTIVE_WRITE_IN_OWNED_SCOPE/);
      flush();
      expect(owned()).toBe(1);
      expect(strict()).toBe(0);
      dispose();
    });
    // Its help text reaches the console a task later.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(takeConsoleMessages().join("\n")).toMatch(/REACTIVE_WRITE_IN_OWNED_SCOPE/);
  });

  test("splits an effect into a tracked compute and an untracked apply with its cleanup", async () => {
    const [count, setCount] = createSignal(0);
    const [other, setOther] = createSignal(0);
    const log: string[] = [];
    const dispose = createRoot((dispose) => {
      createEffect(
        () => count(),
        (value) => {
          // Reading here neither tracks nor stays quiet.
          other();
          log.push(`apply ${value}`);
          return () => log.push(`cleanup ${value}`);
        },
      );
      return dispose;
    });
    flush();
    setOther(1);
    await settled();
    setCount(1);
    await settled();
    dispose();
    expect(log).toEqual(["apply 0", "cleanup 0", "apply 1", "cleanup 1"]);
    expect(takeConsoleMessages().join("\n")).toMatch(/STRICT_READ_UNTRACKED/);
  });

  test("runs onSettled after the first render and its cleanup on dispose, and onCleanup too", async () => {
    const log: string[] = [];
    let connected: boolean | undefined;
    function Part() {
      onSettled(() => {
        log.push("settled");
        return () => log.push("settled cleanup");
      });
      onCleanup(() => log.push("cleanup"));
      return createComponent(Span, {
        // A ref runs before its element joins the document.
        ref: (el: HTMLElement) => (connected = el.isConnected),
        children: "x",
      });
    }
    const view = mount(() => createComponent(Part, {}));
    await settled();
    expect(log).toEqual(["settled"]);
    expect(connected).toBe(false);
    view.dispose();
    expect(log.slice(1).sort()).toEqual(["cleanup", "settled cleanup"]);
  });

  test("makes a context its own provider, and a default-less context throws outside one", async () => {
    const Theme = createContext<string>();
    let read: string | undefined;
    function Reader() {
      read = useContext(Theme);
      return null;
    }
    mount(() =>
      createComponent(Theme, {
        value: "dark",
        get children() {
          return createComponent(Reader, {});
        },
      }),
    );
    expect(read).toBe("dark");
    expect(() => mount(() => createComponent(Reader, {}))).toThrow(/context/i);
    await recoverFromRenderError();
  });

  test("keeps omit and merge live, and lets undefined override in merge", async () => {
    const [label, setLabel] = createSignal("a");
    const props = {
      get label() {
        return label();
      },
      hidden: true,
    };
    const rest = omit(props, "hidden");
    const merged = merge({ label: "default", extra: 1 }, props, { extra: undefined });
    expect(Object.keys(rest)).toEqual(["label"]);
    expect(merged.extra).toBeUndefined();
    setLabel("b");
    flush();
    expect(rest.label).toBe("b");
    expect(merged.label).toBe("b");
    await settled();
  });

  test("passes For's default children the item as a value and the index as an accessor", () => {
    const seen: [string, number][] = [];
    mount(() =>
      createComponent(For as Component<ForProps>, {
        each: ["a", "b"],
        children: (item: string, index: Accessor<number>) => {
          seen.push([item, index()]);
          return null;
        },
      }),
    );
    expect(seen).toEqual([
      ["a", 0],
      ["b", 1],
    ]);
    // The callback's body is an owner, not a tracking scope.
    expect(takeConsoleMessages().join("\n")).toMatch(/STRICT_READ_UNTRACKED/);
  });
});
