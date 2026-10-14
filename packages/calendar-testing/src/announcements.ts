import { normalizeText } from "./queries";

const announcer = '[data-calendar-part="announcer"]';

/**
 * Records what every `Announcer` in a container says, in order: a live region's text after each
 * change, as a screen reader reads it. Only the `Announcer` mounted last speaks, so the record
 * follows whichever one changed. A message that repeats the last gets a trailing no-break space,
 * so its region changes; it counts again.
 */
export function recordAnnouncements(container: HTMLElement) {
  const spoken: string[] = [];
  const lastText = new WeakMap<Element, string>();
  let latest: Element | undefined;

  function read() {
    for (const region of container.querySelectorAll(announcer)) {
      const text = region.textContent ?? "";
      if (text === (lastText.get(region) ?? "")) continue;
      lastText.set(region, text);
      const message = normalizeText(text);
      if (message === "") continue;
      spoken.push(message);
      latest = region;
    }
  }

  const observer = typeof MutationObserver === "function" ? new MutationObserver(read) : undefined;
  observer?.observe(container, { characterData: true, childList: true, subtree: true });

  return {
    /** Every message so far, oldest first. */
    all(): readonly string[] {
      read();
      return [...spoken];
    },
    /** What the announcer that spoke last says now; `undefined` when it's silent or there's none. */
    current(): string | undefined {
      read();
      const text =
        latest !== undefined && container.contains(latest) ? normalizeText(latest.textContent) : "";
      return text === "" ? undefined : text;
    },
    stop: () => observer?.disconnect(),
  };
}
