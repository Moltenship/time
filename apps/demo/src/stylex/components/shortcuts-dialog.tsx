import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Kbd } from "@astryxdesign/core/Kbd";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import * as stylex from "@stylexjs/stylex";
import { Fragment } from "react";

import { keyLabel, shortcutSections, type KeyListItem } from "../../shortcuts";

const styles = stylex.create({
  keys: {
    alignItems: "center",
    display: "flex",
    gap: "0.25rem",
    justifyContent: "flex-end",
  },
  list: {
    alignItems: "center",
    columnGap: "1.5rem",
    display: "grid",
    gridTemplateColumns: "1fr auto",
    rowGap: "0.375rem",
  },
  section: {
    display: "grid",
    gap: "0.5rem",
  },
  sections: {
    display: "grid",
    gap: "1.25rem",
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
      <Text as="h3" color="secondary" type="label">
        {title}
      </Text>
      <dl {...stylex.props(styles.list)}>
        {items.map(({ keys, label }) => (
          <Fragment key={label}>
            <dt>
              <Text>{label}</Text>
            </dt>
            <dd {...stylex.props(styles.keys)}>
              {keys.map((key, index) => (
                <Fragment key={key}>
                  {index > 0 && <Text type="supporting">or</Text>}
                  <Kbd keys={keyLabel(key)} />
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
    <Dialog isOpen={open} maxHeight="calc(100dvh - 2rem)" onOpenChange={onOpenChange} width={448}>
      <Layout
        content={
          <LayoutContent>
            {/* Focusable, so the keyboard can scroll the list where it doesn't fit. */}
            <div
              aria-label="Shortcuts"
              role="group"
              tabIndex={0}
              {...stylex.props(styles.sections)}
            >
              {shortcutSections.map(({ items, title }) => (
                <KeyList key={title} items={items} title={title} />
              ))}
            </div>
          </LayoutContent>
        }
        header={<DialogHeader onOpenChange={onOpenChange} title="Keyboard shortcuts" />}
      />
    </Dialog>
  );
}
