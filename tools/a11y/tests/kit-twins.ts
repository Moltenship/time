/*
 * The kit's controls, React's and Solid's, described one way (ADR 0279, point 10): each element's
 * tag, attributes and text, so `kit-twins.a11y.tsx` and `solid/kit-twins.a11y.tsx` compare what
 * the two kits render with one stored description in `kit-twins/`. What a framework or a run picks
 * is left out: generated ids become their order of appearance, a popup's inline position goes, and
 * a textarea shows its value however the framework set it.
 */

/** Attributes whose value names other elements by id. */
const idReferences = new Set([
  "aria-activedescendant",
  "aria-controls",
  "aria-describedby",
  "aria-labelledby",
  "aria-owns",
  "for",
]);

/** Set by layout as the popup opens, from where it lands on the page. */
const positioned = new Set(["style"]);

/** Lucide's own classes on an icon, which React's icons add and Solid's inline ones don't. */
const lucideClass = /^lucide(?:-|$)/u;

export function describeTree(...roots: readonly Element[]): string {
  const ids = new Map<string, string>();
  const idOf = (id: string) => {
    if (!ids.has(id)) ids.set(id, `#${ids.size + 1}`);
    return ids.get(id)!;
  };
  const lines: string[] = [];

  function attributes(element: Element): string {
    return [...element.attributes]
      .filter(({ name }) => !positioned.has(name))
      .flatMap(({ name, value }) => {
        if (name === "id") return [`id="${idOf(value)}"`];
        if (idReferences.has(name)) {
          return [`${name}="${value.split(/\s+/u).filter(Boolean).map(idOf).join(" ")}"`];
        }
        if (name === "class") {
          const classes = value.split(/\s+/u).filter((token) => token !== "");
          const kept =
            element.namespaceURI === "http://www.w3.org/2000/svg"
              ? classes.filter((token) => !lucideClass.test(token))
              : classes;
          return kept.length === 0 ? [] : [`class="${kept.join(" ")}"`];
        }
        return [`${name}="${value}"`];
      })
      .toSorted()
      .join(" ");
  }

  function walk(node: Node, depth: number) {
    const indent = "  ".repeat(depth);
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.replaceAll(/\s+/gu, " ").trim() ?? "";
      if (text !== "") lines.push(`${indent}"${text}"`);
      return;
    }
    if (!(node instanceof Element)) return;
    const tag = node.localName;
    const attrs = attributes(node);
    lines.push(`${indent}<${tag}${attrs === "" ? "" : ` ${attrs}`}>`);
    // An icon's drawing is its own file's: the kits check the icon's place and look, not its paths.
    if (tag === "svg") return;
    // React writes a textarea's value as its text, Solid as its property: describe the value.
    if (node instanceof HTMLTextAreaElement) {
      if (node.value !== "") lines.push(`${indent}  "${node.value}"`);
      return;
    }
    for (const child of node.childNodes) walk(child, depth + 1);
  }

  for (const root of roots) walk(root, 0);
  return `${lines.join("\n")}\n`;
}

/** The page's elements outside the test's own container: a popup in the top layer or a portal. */
export const popups = (container: Element): Element[] =>
  [...document.body.children].filter(
    (element) =>
      element !== container && !element.contains(container) && element.localName !== "script",
  );

/** Whether `element` has finished opening: open, and past its starting style. */
export const opened = (element: Element | null | undefined): boolean =>
  element != null &&
  element.hasAttribute("data-open") &&
  !element.hasAttribute("data-starting-style");

/** The controls each kit renders, with the same props, for the stored descriptions. */
export const kitFixture = {
  items: [
    { label: "Day", value: "day" },
    { label: "Week", value: "week" },
    { label: "Month", value: "month" },
  ],
  value: "week",
} as const;

/** The toast each kit shows, for the stored description. */
export const kitToast = {
  actionProps: { children: "Undo", onClick: () => {} },
  description: "To undo it, press F6 and choose Undo.",
  id: "kit",
  timeout: 0,
  title: "Moved “Standup”",
} as const;

/** Whether the toast `kitToast` adds has finished showing. */
export const toastShown = (): boolean => {
  const toast = document.querySelector('[aria-label="Notifications"] li');
  return toast !== null && !toast.hasAttribute("data-starting-style");
};
