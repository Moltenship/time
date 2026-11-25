import { For } from "solid-js";

import { demoFrameworks, frameworkHref } from "./framework";

/** React and Solid as links, since each is a page of its own, as in the React demo's top bar. */
export function FrameworkSwitch() {
  return (
    <div aria-label="Framework" class="switch" role="group">
      <For each={demoFrameworks}>
        {(option) => (
          <a
            aria-current={option.value === "solid" ? "page" : undefined}
            href={frameworkHref(option.value)}
            // The URL's view and date change after the link got its address.
            onClick={(click) => {
              click.currentTarget.href = frameworkHref(option.value);
            }}
          >
            {option.label}
          </a>
        )}
      </For>
    </div>
  );
}
