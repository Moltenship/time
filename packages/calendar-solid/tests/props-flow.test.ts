// @vitest-environment jsdom

import { createComponent } from "@solidjs/web";
import { createMemo, createRoot, createSignal, flush } from "solid-js";
import { describe, expect, test } from "vite-plus/test";

import { keyedList, when } from "../src/flow";
import { element, splitOptions } from "../src/props";
import { mount, settled } from "./harness/render";
import "./setup";

const Item = element("li");
const List = element("ul");

describe("splitOptions", () => {
  test("reads the options live and leaves the rest a live view of the props", () => {
    const [value, setValue] = createSignal(1);
    const [label, setLabel] = createSignal("a");
    const props = {
      get value() {
        return value();
      },
      get "aria-label"() {
        return label();
      },
      defaultValue: 0,
    };
    // A root's body is an owned scope, where writes throw: write after it returns.
    const { dispose, rest, tracked } = createRoot((dispose) => {
      const [options, rest] = splitOptions(props, ["value", "defaultValue"]);
      return { dispose, rest, tracked: createMemo(() => options()) };
    });
    expect(tracked()).toEqual({ value: 1, defaultValue: 0 });
    expect(Object.keys(rest)).toEqual(["aria-label"]);
    setValue(2);
    setLabel("b");
    flush();
    expect(tracked()).toEqual({ value: 2, defaultValue: 0 });
    expect(rest["aria-label"]).toBe("b");
    dispose();
  });
});

describe("element", () => {
  test("renders a native element whose props and children follow signals", async () => {
    const [label, setLabel] = createSignal("first");
    let ref: HTMLElement | undefined;
    const view = mount(() =>
      createComponent(List, {
        get "aria-label"() {
          return label();
        },
        class: { list: true },
        ref: (el: HTMLElement) => (ref = el),
        get children() {
          return createComponent(Item, {
            get children() {
              return label();
            },
          });
        },
      }),
    );
    const list = view.container.firstElementChild!;
    expect(list.outerHTML).toBe('<ul aria-label="first" class="list"><li>first</li></ul>');
    expect(ref).toBe(list);
    setLabel("second");
    await settled();
    expect(view.container.firstElementChild).toBe(list);
    expect(list.outerHTML).toBe('<ul aria-label="second" class="list"><li>second</li></ul>');
    expect(element("ul")).toBe(List);
  });
});

describe("keyedList", () => {
  test("keeps an item's element while it stays, and shows the fallback when empty", async () => {
    const [items, setItems] = createSignal<readonly string[]>(["a", "b"]);
    let renders = 0;
    const view = mount(() =>
      createComponent(List, {
        get children() {
          return keyedList(
            items,
            (item, index) => {
              renders += 1;
              return createComponent(Item, {
                get children() {
                  return `${index()}:${item}`;
                },
              });
            },
            () => createComponent(Item, { children: "none" }),
          );
        },
      }),
    );
    const text = () => [...view.container.querySelectorAll("li")].map((li) => li.textContent);
    expect(text()).toEqual(["0:a", "1:b"]);
    const b = view.container.querySelectorAll("li")[1];

    setItems(["b", "c"]);
    await settled();
    expect(text()).toEqual(["0:b", "1:c"]);
    expect(view.container.querySelectorAll("li")[0]).toBe(b);
    expect(renders).toBe(3);

    setItems([]);
    await settled();
    expect(text()).toEqual(["none"]);
  });
});

describe("when", () => {
  test("renders while truthy, keeps its content across truthy values, and falls back", async () => {
    const [user, setUser] = createSignal<{ readonly name: string } | null>({ name: "Ada" });
    let renders = 0;
    const view = mount(() =>
      when(
        user,
        (current) => {
          renders += 1;
          return createComponent(Item, {
            get children() {
              return current().name;
            },
          });
        },
        () => createComponent(Item, { children: "nobody" }),
      ),
    );
    expect(view.container.textContent).toBe("Ada");
    setUser({ name: "Grace" });
    await settled();
    expect(view.container.textContent).toBe("Grace");
    expect(renders).toBe(1);
    setUser(null);
    await settled();
    expect(view.container.textContent).toBe("nobody");
  });
});
