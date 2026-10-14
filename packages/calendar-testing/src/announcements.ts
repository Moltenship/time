import { normalizeText } from "./queries";

const announcer = '[data-calendar-part="announcer"]';

/**
 * Records what each `Announcer` in a container says, in order: the live region's text after
 * every change, as a screen reader would read it. A message that repeats the last gets a
 * trailing no-break space so the region changes; it counts again.
 */
export function recordAnnouncements(container: HTMLElement) {
  const spoken: string[] = [];
  let last = "";

  function read() {
    const text = container.querySelector(announcer)?.textContent ?? "";
    if (text === last) return;
    last = text;
    const message = normalizeText(text);
    if (message !== "") spoken.push(message);
  }

  const observer = typeof MutationObserver === "function" ? new MutationObserver(read) : undefined;
  observer?.observe(container, { characterData: true, childList: true, subtree: true });

  return {
    /** Every message so far, oldest first. */
    all(): readonly string[] {
      read();
      return [...spoken];
    },
    /** What the announcer says now; `undefined` when there's none or it's silent. */
    current(): string | undefined {
      read();
      const text = normalizeText(container.querySelector(announcer)?.textContent);
      return text === "" ? undefined : text;
    },
    stop: () => observer?.disconnect(),
  };
}
