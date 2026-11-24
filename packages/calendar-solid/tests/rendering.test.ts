// @vitest-environment jsdom

import { createComponent, type JSX } from "@solidjs/web";
import { checkPattern } from "@ui-sdk/core/testing";
import { createSignal, flush } from "solid-js";
import { describe, expect, test } from "vite-plus/test";

import { element } from "../src/props";
import { Rating, RatingRoot, RatingStar, type RatingHandle } from "./fixtures/rating-parts";
import { click, mount, press, settled } from "./harness/render";
import "./setup";

type RatingComponent = typeof Rating | typeof RatingRoot;
type Change = readonly [value: number, reason: string];

function stars(): JSX.Element {
  return ["1", "2", "3"].map((value) =>
    createComponent(RatingStar, {
      value,
      "aria-label": `${value} stars`,
      class: (state: { readonly filled?: boolean }) => (state.filled ? "on" : "off"),
      children: "★",
    }),
  );
}

function buttons(container: HTMLElement): HTMLButtonElement[] {
  return [...container.querySelectorAll<HTMLButtonElement>('[data-slot="rating-star"]')];
}

const checked = (container: HTMLElement) =>
  buttons(container).map((button) => button.getAttribute("aria-checked"));
const tabStops = (container: HTMLElement) =>
  buttons(container).map((button) => button.getAttribute("tabindex"));

describe.each<[string, RatingComponent]>([
  ["createParts' Root", Rating],
  ["a root written with usePrimitive and usePart", RatingRoot],
])("%s", (_, Root) => {
  test("renders the root and its parts with the primitive's ARIA", async () => {
    const view = mount(() =>
      createComponent(Root, {
        defaultValue: 2,
        "aria-label": "Rating",
        get children() {
          return stars();
        },
      }),
    );
    const group = view.container.querySelector('[role="radiogroup"]')!;
    expect(group.getAttribute("data-slot")).toBe("rating");
    expect(group.getAttribute("aria-label")).toBe("Rating");
    expect(checked(view.container)).toEqual(["false", "true", "false"]);
    expect(tabStops(view.container)).toEqual(["-1", "0", "-1"]);
    expect(buttons(view.container).map((button) => button.getAttribute("data-filled"))).toEqual([
      "",
      "",
      null,
    ]);
    await checkPattern(group as HTMLElement, "radio-group");
  });

  test("keeps its own value when uncontrolled", async () => {
    const changes: Change[] = [];
    const view = mount(() =>
      createComponent(Root, {
        "aria-label": "Rating",
        onValueChange: (value: number, details: { readonly reason: string }) =>
          void changes.push([value, details.reason]),
        get children() {
          return stars();
        },
      }),
    );
    expect(tabStops(view.container)).toEqual(["0", "-1", "-1"]);
    click(buttons(view.container)[2]!);
    await settled();
    expect(checked(view.container)).toEqual(["false", "false", "true"]);
    expect(changes).toEqual([[3, "item-press"]]);
    expect(buttons(view.container)[2]!.className).toBe("on");
  });

  test("follows a signal when controlled, and keeps it when the callback refuses", async () => {
    const [value, setValue] = createSignal(1);
    let accept = true;
    const view = mount(() =>
      createComponent(Root, {
        "aria-label": "Rating",
        get value() {
          return value();
        },
        onValueChange: (next: number) => {
          if (accept) setValue(next);
        },
        get children() {
          return stars();
        },
      }),
    );
    click(buttons(view.container)[1]!);
    await settled();
    expect(value()).toBe(2);
    expect(checked(view.container)).toEqual(["false", "true", "false"]);

    accept = false;
    click(buttons(view.container)[2]!);
    await settled();
    expect(checked(view.container)).toEqual(["false", "true", "false"]);

    setValue(3);
    await settled();
    expect(checked(view.container)).toEqual(["false", "false", "true"]);
    expect(tabStops(view.container)).toEqual(["-1", "-1", "0"]);
  });

  test("moves focus and the value with the arrow keys, Home and End", async () => {
    const view = mount(() =>
      createComponent(Root, {
        defaultValue: 1,
        "aria-label": "Rating",
        get children() {
          return stars();
        },
      }),
    );
    const [first, second, third] = buttons(view.container);
    first!.focus();
    press(first!, "ArrowRight");
    await settled();
    expect(document.activeElement).toBe(second);
    expect(checked(view.container)).toEqual(["false", "true", "false"]);

    press(second!, "End");
    await settled();
    expect(document.activeElement).toBe(third);
    press(third!, "ArrowDown");
    await settled();
    // The rating loops.
    expect(document.activeElement).toBe(first);
    press(first!, "ArrowLeft");
    await settled();
    expect(document.activeElement).toBe(third);
    press(third!, "Home");
    await settled();
    expect(document.activeElement).toBe(first);
    expect(tabStops(view.container)).toEqual(["0", "-1", "-1"]);
  });

  test("updates its element's props in place and removes parts that leave", async () => {
    const [label, setLabel] = createSignal("Rating");
    const [count, setCount] = createSignal(3);
    const view = mount(() =>
      createComponent(Root, {
        defaultValue: 3,
        get "aria-label"() {
          return label();
        },
        get children() {
          return Array.from({ length: count() }, (_, index) =>
            createComponent(RatingStar, {
              value: String(index + 1),
              "aria-label": `${index + 1} stars`,
            }),
          );
        },
      }),
    );
    const group = view.container.firstElementChild;
    setLabel("Score");
    await settled();
    expect(view.container.firstElementChild).toBe(group);
    expect(group!.getAttribute("aria-label")).toBe("Score");

    setCount(2);
    await settled();
    expect(buttons(view.container)).toHaveLength(2);
    expect(view.container.querySelector('[aria-checked="true"]')).toBeNull();
  });
});

describe("a hand-written root's handle", () => {
  test("exposes the instance's state, its subscription and its api", async () => {
    let handle: RatingHandle | undefined;
    const view = mount(() =>
      createComponent(RatingRoot, {
        defaultValue: 1,
        "aria-label": "Rating",
        onHandle: (next: RatingHandle) => (handle = next),
        get children() {
          return stars();
        },
      }),
    );
    expect(handle!.state.value).toBe(1);
    expect(handle!.instance.get().value).toBe(1);

    const seen: number[] = [];
    const unsubscribe = handle!.instance.subscribe(() => seen.push(handle!.instance.get().value));
    handle!.api.rate(3);
    // The instance changes at once; Solid's DOM follows on its next flush.
    expect(handle!.instance.get().value).toBe(3);
    expect(seen.at(-1)).toBe(3);
    await settled();
    expect(checked(view.container)).toEqual(["false", "false", "true"]);

    unsubscribe();
    handle!.api.rate(2);
    expect(seen.at(-1)).toBe(3);
    view.dispose();
  });
});

describe("refs and render props", () => {
  test("a part passes the element to the user's ref, and render replaces its element", () => {
    let star: HTMLElement | undefined;
    const Link = element("a");
    const view = mount(() =>
      createComponent(Rating, {
        "aria-label": "Rating",
        get children() {
          return [
            createComponent(RatingStar, {
              value: "1",
              "aria-label": "1 star",
              ref: (el: HTMLElement) => (star = el),
            }),
            createComponent(RatingStar, {
              value: "2",
              "aria-label": "2 stars",
              render: (props: Record<string, unknown>) =>
                createComponent(Link, { ...props, href: "#two" }),
            }),
          ];
        },
      }),
    );
    expect(star).toBe(view.container.querySelector('[aria-label="1 star"]'));
    const link = view.container.querySelector("a")!;
    expect(link.getAttribute("href")).toBe("#two");
    expect(link.getAttribute("role")).toBe("radio");
    expect(link.getAttribute("data-slot")).toBe("rating-star");
    flush();
  });
});
