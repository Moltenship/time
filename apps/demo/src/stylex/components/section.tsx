import { Text } from "@astryxdesign/core/Text";
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

const styles = stylex.create({
  heading: {
    paddingBlockEnd: "0.5rem",
  },
  list: {
    display: "grid",
    gap: "0.5rem",
  },
});

/** A sidebar section's title. */
export function SectionHeading({
  children,
  id,
}: {
  readonly children: ReactNode;
  readonly id: string;
}) {
  return (
    <Text as="h2" display="block" id={id} type="label" xstyle={styles.heading}>
      {children}
    </Text>
  );
}

/** A sidebar section's list of checkboxes. */
export const listProps = stylex.props(styles.list);
