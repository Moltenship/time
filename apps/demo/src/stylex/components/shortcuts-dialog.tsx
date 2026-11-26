import * as stylex from "@stylexjs/stylex";
import { Fragment } from "react";

import { keyLabel, shortcutSections, type KeyListItem } from "../../shortcuts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";

const small = "@media (min-width: 640px)";

const styles = stylex.create({
  content: {
    gap: "1.25rem",
    maxWidth: { default: "calc(100% - 2rem)", [small]: "28rem" },
  },
  section: {
    display: "grid",
    gap: "0.5rem",
  },
  title: {
    color: "var(--muted-foreground)",
    fontSize: "0.75rem",
    fontWeight: 500,
    lineHeight: "calc(1 / 0.75)",
    textTransform: "uppercase",
  },
  list: {
    alignItems: "center",
    columnGap: "1.5rem",
    display: "grid",
    gridTemplateColumns: "1fr auto",
    rowGap: "0.375rem",
  },
  keys: {
    alignItems: "center",
    color: "var(--muted-foreground)",
    display: "flex",
    fontSize: "0.75rem",
    gap: "0.25rem",
    justifyContent: "flex-end",
    lineHeight: "calc(1 / 0.75)",
  },
  key: {
    backgroundColor: "var(--muted)",
    borderColor: "var(--border)",
    borderRadius: "calc(var(--radius) * 0.8)",
    borderStyle: "solid",
    borderWidth: 1,
    color: "var(--foreground)",
    fontFamily: "inherit",
    minWidth: "1.5rem",
    paddingBlock: "0.125rem",
    paddingInline: "0.375rem",
    textAlign: "center",
  },
});

function KeyList({
  items,
  title,
}: {
  readonly items: readonly KeyListItem[];
  readonly title: string;
}) {
  return (
    <section {...stylex.props(styles.section)}>
      <h3 {...stylex.props(styles.title)}>{title}</h3>
      <dl {...stylex.props(styles.list)}>
        {items.map(({ keys, label }) => (
          <Fragment key={label}>
            <dt>{label}</dt>
            <dd {...stylex.props(styles.keys)}>
              {keys.map((key, index) => (
                <Fragment key={key}>
                  {index > 0 && <span>or</span>}
                  <kbd {...stylex.props(styles.key)}>{keyLabel(key)}</kbd>
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
  finalFocus,
  onOpenChange,
  open,
}: {
  /** Where focus goes when the dialog closes: by default, where it was before it opened. */
  readonly finalFocus?: () => HTMLElement | null | undefined;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent finalFocus={finalFocus} xstyle={styles.content}>
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
