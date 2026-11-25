import { Show } from "solid-js";

/**
 * A polite live region, mounted up front so screen readers announce each message. It sits above
 * the undo toast, so both can show.
 */
export function Notice(props: { readonly text: string | null }) {
  return (
    <div
      aria-live="polite"
      role="status"
      class="pointer-events-none fixed inset-x-0 bottom-40 z-50 flex justify-center px-4 lg:bottom-20"
    >
      <Show when={props.text}>
        {(text) => (
          <p class="rounded-lg bg-foreground px-4 py-2.5 text-sm text-background shadow-lg animate-in fade-in-0 slide-in-from-bottom-2">
            {text()}
          </p>
        )}
      </Show>
    </div>
  );
}
