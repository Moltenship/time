import { Fragment } from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@registry/ui/dialog";

import { shortcuts } from "../shortcuts";

/** Keys for moving around inside the calendar. */
const navigationKeys = [
  { keys: ["Tab"], label: "Move into or out of the calendar" },
  { keys: ["↑ ↓ ← →"], label: "Move between days, times and events" },
  { keys: ["Home", "End"], label: "Go to the first or last day" },
  { keys: ["PageUp", "PageDown"], label: "Go back or forward a page" },
  { keys: ["Enter"], label: "Open the focused event, or go into a day's events" },
  { keys: ["Shift+Enter"], label: "Open the focused day" },
  { keys: ["Escape"], label: "Go back from an event to its day" },
] as const;

/** Keys for moving, resizing and creating events. */
const editingKeys = [
  { keys: ["Space"], label: "Pick up the focused event to move it" },
  { keys: ["Shift+Space"], label: "Pick up the focused event to resize it" },
  { keys: ["Space"], label: "Start a new event on the focused day or time" },
  { keys: ["↑ ↓ ← →"], label: "Move, resize or extend it" },
  { keys: ["Enter", "Space"], label: "Save the change" },
  { keys: ["Escape"], label: "Cancel the change" },
] as const;

const keyNames: Readonly<Record<string, string>> = {
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  Escape: "Esc",
  PageDown: "Page Down",
  PageUp: "Page Up",
};

function KeyList({
  items,
  title,
}: {
  readonly items: readonly { readonly keys: readonly string[]; readonly label: string }[];
  readonly title: string;
}) {
  return (
    <section className="grid gap-2">
      <h3 className="text-xs font-medium text-muted-foreground uppercase">{title}</h3>
      <dl className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1.5">
        {items.map(({ keys, label }) => (
          <Fragment key={label}>
            <dt>{label}</dt>
            <dd className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
              {keys.map((key, index) => (
                <Fragment key={key}>
                  {index > 0 && <span>or</span>}
                  <kbd className="min-w-6 rounded-md border bg-muted px-1.5 py-0.5 text-center font-sans text-foreground">
                    {keyNames[key] ?? (key.length === 1 ? key.toUpperCase() : key)}
                  </kbd>
                </Fragment>
              ))}
            </dd>
          </Fragment>
        ))}
      </dl>
    </section>
  );
}

export function ShortcutsDialog({
  onOpenChange,
  open,
}: {
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <KeyList items={shortcuts} title="Anywhere" />
        <KeyList items={navigationKeys} title="In the calendar" />
        <KeyList items={editingKeys} title="Changing events" />
      </DialogContent>
    </Dialog>
  );
}
