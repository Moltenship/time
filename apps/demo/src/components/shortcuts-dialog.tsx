import { Fragment } from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@registry/ui/dialog";

import { keyLabel, shortcutSections, type KeyListItem } from "../shortcuts";

function KeyList({
  items,
  title,
}: {
  readonly items: readonly KeyListItem[];
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
                    {keyLabel(key)}
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
        {shortcutSections.map(({ items, title }) => (
          <KeyList key={title} items={items} title={title} />
        ))}
      </DialogContent>
    </Dialog>
  );
}
