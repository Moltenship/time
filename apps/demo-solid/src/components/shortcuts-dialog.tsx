import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { For, Show } from "solid-js";

import { keyLabel, shortcutSectionsFor, type KeyListItem } from "@demo/shortcuts";

import { hasView } from "../workspace";

function KeyList(props: { readonly items: readonly KeyListItem[]; readonly title: string }) {
  return (
    <section class="grid gap-2">
      <h3 class="text-xs font-medium text-muted-foreground uppercase">{props.title}</h3>
      <dl class="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1.5">
        <For each={props.items}>
          {(item) => (
            <>
              <dt>{item.label}</dt>
              <dd class="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                <For each={item.keys}>
                  {(key, index) => (
                    <>
                      <Show when={index() > 0}>
                        <span>or</span>
                      </Show>
                      <kbd class="min-w-6 rounded-md border bg-muted px-1.5 py-0.5 text-center font-sans text-foreground">
                        {keyLabel(key)}
                      </kbd>
                    </>
                  )}
                </For>
              </dd>
            </>
          )}
        </For>
      </dl>
    </section>
  );
}

// The keys of the views this page registers.
const sections = shortcutSectionsFor(hasView);

export function ShortcutsDialog(props: {
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent class="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <For each={sections}>
          {(section) => <KeyList items={section.items} title={section.title} />}
        </For>
      </DialogContent>
    </Dialog>
  );
}
