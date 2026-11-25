/** How the parity tests read an element: its computed styles, box and pseudo-elements. */

/** What the comparison reads. Sizes come from the box, so `auto` and `100%` compare as laid out. */
export const properties = [
  "align-items",
  "align-self",
  "animation-delay",
  "animation-direction",
  "animation-duration",
  "animation-fill-mode",
  "animation-iteration-count",
  "animation-timing-function",
  "backdrop-filter",
  "background-clip",
  "background-color",
  "background-image",
  "box-shadow",
  "color",
  "column-gap",
  "cursor",
  "display",
  "fill",
  "filter",
  "flex-direction",
  "flex-grow",
  "flex-shrink",
  "flex-wrap",
  "font-family",
  "font-size",
  "font-style",
  "font-variant-numeric",
  "font-weight",
  "justify-content",
  "letter-spacing",
  "line-height",
  "list-style-type",
  "opacity",
  "overflow-x",
  "overflow-y",
  "pointer-events",
  "position",
  "row-gap",
  "stroke",
  "stroke-width",
  "text-align",
  "text-decoration-line",
  "text-overflow",
  "text-transform",
  "transition-delay",
  "transition-duration",
  "transition-property",
  "transition-timing-function",
  "user-select",
  "visibility",
  "white-space",
  "z-index",
  "-webkit-font-smoothing",
] as const;
const sides = ["top", "right", "bottom", "left"] as const;
const pseudoProperties = [
  "background-color",
  "border-top-left-radius",
  "content",
  "display",
  "opacity",
  "position",
] as const;

/** An element's name in a message: its tag, slot, role or name, after its parent's. */
export function label(element: Element): string {
  const name = (node: Element) => {
    const slot = node.getAttribute("data-slot") ?? node.getAttribute("data-calendar-part");
    const role = node.getAttribute("role");
    const aria = node.getAttribute("aria-label");
    return [
      node.tagName.toLowerCase(),
      slot === null ? "" : `[${slot}]`,
      role === null ? "" : `(${role})`,
      aria === null ? "" : ` "${aria.slice(0, 30)}"`,
    ].join("");
  };
  const parent = element.parentElement;
  return parent === null ? name(element) : `${name(parent)} > ${name(element)}`;
}

export const round = (value: number) => String(Math.round(value * 2) / 2);

/** What an SVG shape draws with: text and box properties do nothing there. */
const svgProperties = new Set([
  "display",
  "fill",
  "opacity",
  "stroke",
  "stroke-width",
  "visibility",
]);
const colour = /(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)/gu;
const pixel = new OffscreenCanvas(1, 1).getContext("2d", { willReadFrequently: true })!;

/** Colours as the pixel they paint, so `oklab(0 0 0 / 0.7)` and `rgba(0, 0, 0, 0.7)` agree. */
export function painted(value: string) {
  return value.replaceAll(colour, (found) => {
    pixel.clearRect(0, 0, 1, 1);
    pixel.fillStyle = found;
    pixel.fillRect(0, 0, 1, 1);
    return `rgba(${pixel.getImageData(0, 0, 1, 1).data.join(", ")})`;
  });
}

/** `translate`, `rotate`, `scale` and `transform` as the one matrix they apply. */
function transformOf(element: Element, style: CSSStyleDeclaration) {
  const matrix = new DOMMatrix();
  const translate = style.getPropertyValue("translate");
  if (translate !== "none") {
    // A percentage is of the element's own size, before it moves.
    const size = [
      (element as HTMLElement).offsetWidth ?? 0,
      (element as HTMLElement).offsetHeight ?? 0,
    ];
    const [x = "0px", y = "0px"] = translate
      .split(" ")
      .map((part, axis) =>
        part.endsWith("%") ? `${(Number.parseFloat(part) / 100) * size[axis]!}px` : part,
      );
    matrix.multiplySelf(new DOMMatrix(`translate(${x}, ${y})`));
  }
  const rotate = style.getPropertyValue("rotate");
  if (rotate !== "none") matrix.multiplySelf(new DOMMatrix(`rotate(${rotate})`));
  const scale = style.getPropertyValue("scale");
  if (scale !== "none") matrix.multiplySelf(new DOMMatrix(`scale(${scale.split(" ").join(", ")})`));
  const transform = style.getPropertyValue("transform");
  if (transform !== "none") matrix.multiplySelf(new DOMMatrix(transform));
  return matrix.isIdentity ? "none" : matrix.toString();
}

/** Layers split at their top-level commas. */
const layers = (value: string) => value.split(/,(?![^(]*\))/u).map((layer) => layer.trim());

/**
 * What Tailwind adds that draws nothing: the transparent shadows its ring utilities compose with,
 * and its own custom properties in a transition's list.
 */
export function drawn(property: string, value: string) {
  if (property === "box-shadow" && value !== "none") {
    const shown = layers(value).filter((layer) => !layer.startsWith("rgba(0, 0, 0, 0)"));
    return shown.length === 0 ? "none" : shown.join(", ");
  }
  if (property === "transition-property") {
    return layers(value)
      .filter((layer) => !layer.startsWith("--tw-"))
      .join(", ");
  }
  return value;
}

export function read(win: Window, element: Element): Record<string, string> {
  const box = element.getBoundingClientRect();
  // Hidden for screen readers alone, as ui-sdk's form inputs and the views' labels are.
  if (box.width <= 1 && box.height <= 1) return { box: "hidden" };
  const style = win.getComputedStyle(element);
  const svg = element.namespaceURI === "http://www.w3.org/2000/svg" && element.tagName !== "svg";
  const values: Record<string, string> = {};
  for (const property of properties) {
    if (!svg || svgProperties.has(property)) {
      values[property] = drawn(property, painted(style.getPropertyValue(property)));
    }
  }
  values.box = [box.x, box.y, box.width, box.height].map(round).join(" ");
  values.transform = transformOf(element, style);
  if (svg) return values;
  // Only inline content and table cells align vertically.
  const display = style.getPropertyValue("display");
  if (/^inline|^table-cell/u.test(display))
    values["vertical-align"] = style.getPropertyValue("vertical-align");
  for (const side of sides) {
    values[`margin-${side}`] = style.getPropertyValue(`margin-${side}`);
    values[`padding-${side}`] = style.getPropertyValue(`padding-${side}`);
    const width = style.getPropertyValue(`border-${side}-width`);
    const border = style.getPropertyValue(`border-${side}-style`);
    values[`border-${side}`] =
      width === "0px" || border === "none" || border === "hidden"
        ? "none"
        : painted(`${width} ${border} ${style.getPropertyValue(`border-${side}-color`)}`);
  }
  // A corner rounds by half the box at most, so `9999px` and Tailwind's `calc(infinity * 1px)` agree.
  const most = Math.min(box.width, box.height) / 2;
  for (const corner of ["top-left", "top-right", "bottom-right", "bottom-left"]) {
    const radius = Number.parseFloat(style.getPropertyValue(`border-${corner}-radius`)) || 0;
    values[`border-${corner}-radius`] = round(Math.min(radius, most));
  }
  const outline = style.getPropertyValue("outline-style");
  values.outline =
    outline === "none"
      ? "none"
      : painted(
          ["outline-width", "outline-style", "outline-color", "outline-offset"]
            .map((property) => style.getPropertyValue(property))
            .join(" "),
        );
  if (element.children.length === 0) values.text = element.textContent?.trim() ?? "";
  for (const pseudo of ["::before", "::after"]) {
    const part = win.getComputedStyle(element, pseudo);
    values[pseudo] =
      part.getPropertyValue("content") === "none"
        ? "none"
        : painted(
            pseudoProperties
              .map((property) => part.getPropertyValue(property))
              .map((value, index) =>
                pseudoProperties[index] === "border-top-left-radius" &&
                Number.parseFloat(value) >= 9999
                  ? "full"
                  : value,
              )
              .join(" | "),
          );
  }
  return values;
}
