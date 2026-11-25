import { For } from "solid-js";

import { demoFrameworks, frameworkHref } from "./framework";

/**
 * React and Solid as links, since each is a page of its own, as in the React demo's top bar.
 * `search` is the page's view and date as the URL has them, so the links follow every change, for
 * a middle click or a copied link too.
 */
export function FrameworkSwitch(props: { readonly search: string }) {
  return (
    <div aria-label="Framework" class="switch" role="group">
      <For each={demoFrameworks}>
        {(option) => (
          <a
            aria-current={option.value === "solid" ? "page" : undefined}
            href={frameworkHref(option.value, props.search)}
          >
            {option.label}
          </a>
        )}
      </For>
    </div>
  );
}
