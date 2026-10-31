"use client";

import { Button } from "@astryxdesign/core/Button";
import { Dialog } from "@base-ui/react/dialog";
import * as stylex from "@stylexjs/stylex";
import { useInsertionEffect, useLayoutEffect, useRef } from "react";

import { calendarVars } from "@registry/stylex-calendar-theme/calendar-tokens.stylex";

const fadeIn = stylex.keyframes({ from: { opacity: 0 } });
const fadeOut = stylex.keyframes({ to: { opacity: 0 } });
const popIn = stylex.keyframes({ from: { opacity: 0, transform: "scale3d(0.95, 0.95, 0.95)" } });
const popOut = stylex.keyframes({ to: { opacity: 0, transform: "scale3d(0.95, 0.95, 0.95)" } });

const styles = stylex.create({
  choice: {
    justifyContent: "flex-start",
  },
  choices: {
    display: "grid",
    gap: "0.5rem",
  },
  content: {
    animationDuration: { default: "100ms", "@media (prefers-reduced-motion: reduce)": "0s" },
    animationName: { default: null, "[data-open]": popIn, "[data-closed]": popOut },
    backgroundColor: calendarVars["--popover"],
    borderRadius: "calc(var(--radius) * 1.4)",
    boxShadow: `0 0 0 1px color-mix(in oklch, ${calendarVars["--foreground"]} 10%, transparent)`,
    color: calendarVars["--popover-foreground"],
    display: "grid",
    fontSize: "0.875rem",
    gap: "1rem",
    left: "50%",
    lineHeight: "1.25rem",
    maxWidth: { default: "calc(100% - 2rem)", "@media (min-width: 640px)": "24rem" },
    outlineStyle: "none",
    padding: "1rem",
    position: "fixed",
    top: "50%",
    translate: "-50% -50%",
    width: "100%",
    zIndex: 50,
  },
  description: {
    color: calendarVars["--muted-foreground"],
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    marginBlock: 0,
  },
  footer: {
    backgroundColor: `color-mix(in oklch, ${calendarVars["--muted"]} 50%, transparent)`,
    borderBottomLeftRadius: "calc(var(--radius) * 1.4)",
    borderBottomRightRadius: "calc(var(--radius) * 1.4)",
    borderTopColor: calendarVars["--border"],
    borderTopStyle: "solid",
    borderTopWidth: 1,
    display: "flex",
    flexDirection: { default: "column-reverse", "@media (min-width: 640px)": "row" },
    gap: "0.5rem",
    justifyContent: { default: null, "@media (min-width: 640px)": "flex-end" },
    marginBottom: "-1rem",
    marginInline: "-1rem",
    padding: "1rem",
  },
  header: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  overlay: {
    animationDuration: { default: "100ms", "@media (prefers-reduced-motion: reduce)": "0s" },
    animationName: { default: null, "[data-open]": fadeIn, "[data-closed]": fadeOut },
    backdropFilter: { default: null, "@supports (backdrop-filter: blur(0))": "blur(4px)" },
    backgroundColor: "rgb(0 0 0 / 0.1)",
    inset: 0,
    isolation: "isolate",
    position: "fixed",
    zIndex: 50,
  },
  title: {
    fontFamily: "inherit",
    fontSize: "1rem",
    fontWeight: 500,
    lineHeight: 1,
    marginBlock: 0,
  },
});

/**
 * Which events a change to one occurrence of a recurring event applies to: `"this"` occurrence
 * alone, `"following"` (it and every later one), or `"all"` of the series.
 *
 * The same union as `RecurrenceEditScope` from `@moltenship/calendar-recurrence`, declared here so
 * the registry source depends on nothing but `@moltenship/calendar`. The two match structurally,
 * so a scope from this dialog passes straight to `resolveRecurrenceEdit`.
 */
export type RecurrenceEditScope = "this" | "following" | "all";

/** What the pending change does; it picks the dialog's title and question. */
export type RecurrenceScopeAction = "edit" | "delete";

/** The order the dialog lists scopes in, from the narrowest to the whole series. */
const scopeOrder: readonly RecurrenceEditScope[] = ["this", "following", "all"];

const scopeLabels: Readonly<Record<RecurrenceEditScope, string>> = {
  this: "This event",
  following: "This and following events",
  all: "All events",
};

const actionCopy: Readonly<
  Record<RecurrenceScopeAction, { readonly question: string; readonly title: string }>
> = {
  edit: {
    question: "Which events should this change apply to?",
    title: "Edit recurring event",
  },
  delete: {
    question: "Which events do you want to delete?",
    title: "Delete recurring event",
  },
};

/**
 * The scopes the dialog offers for `scopes`, in display order: this, following, all, whatever
 * order they are given in. Duplicates and unknown values drop out; no `scopes` means all three.
 */
export function offeredRecurrenceScopes(
  scopes?: readonly RecurrenceEditScope[],
): readonly RecurrenceEditScope[] {
  return scopes === undefined ? scopeOrder : scopeOrder.filter((scope) => scopes.includes(scope));
}

export interface RecurrenceScopeDialogProps {
  /** An edit (move, resize, update) or a delete. Defaults to `"edit"`. */
  readonly action?: RecurrenceScopeAction;
  /** The event's title, quoted in the question. */
  readonly eventTitle?: string;
  /**
   * Called once the dialog has closed and focus is back where it was. Apply the answer then: when
   * the edit replaces the focused event, as `"all"` does, the calendar moves focus to the new one.
   * Applied earlier, focus has nowhere to go back to and drops to the page.
   */
  readonly onClosed?: () => void;
  /**
   * Called with the scope picked, or with `null` when the dialog is dismissed: Cancel, Escape or
   * a click outside. Clicks while the dialog animates closed call nothing.
   */
  readonly onResolve: (scope: RecurrenceEditScope | null) => void;
  readonly open: boolean;
  /**
   * The scopes to offer, such as no "This and following events" on a series' first occurrence.
   * They show in a fixed order whatever order they come in. Defaults to all three.
   */
  readonly scopes?: readonly RecurrenceEditScope[];
}

/**
 * Calls `onClosed` once the dialog it is in has unmounted and focus is back. Base UI queues that
 * focus as the popup unmounts, and the popup's cleanups run before those of its children, so the
 * call this one queues comes after it. The browser a11y suite checks that order.
 */
function ClosedSignal({ onClosed }: { readonly onClosed: (() => void) | undefined }) {
  const latest = useRef(onClosed);
  const mounted = useRef(false);
  useInsertionEffect(() => {
    latest.current = onClosed;
  });
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // StrictMode runs this cleanup and mounts again at once; only a real unmount stays down.
      queueMicrotask(() => {
        if (!mounted.current) latest.current?.();
      });
    };
  }, []);
  return null;
}

/**
 * Asks which events of a recurring series a change applies to: one button per scope, then
 * Cancel. Focus starts on the narrowest scope offered, stays in the dialog while it is open, and
 * goes back to where it was when the dialog closes. `useRecurrenceScopePrompt` wraps it in a
 * promise for `onEventChange`.
 */
export function RecurrenceScopeDialog({
  action = "edit",
  eventTitle,
  onClosed,
  onResolve,
  open,
  scopes,
}: RecurrenceScopeDialogProps) {
  const firstChoice = useRef<HTMLButtonElement>(null);
  const { question, title } = actionCopy[action];
  const subject = eventTitle === undefined ? "This event" : `“${eventTitle}”`;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && open) onResolve(null);
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop data-slot="dialog-overlay" {...stylex.props(styles.overlay)} />
        <Dialog.Popup
          data-slot="dialog-content"
          initialFocus={firstChoice}
          {...stylex.props(styles.content)}
        >
          <div data-slot="dialog-header" {...stylex.props(styles.header)}>
            <Dialog.Title data-slot="dialog-title" {...stylex.props(styles.title)}>
              {title}
            </Dialog.Title>
            <Dialog.Description
              data-slot="dialog-description"
              {...stylex.props(styles.description)}
            >
              {subject} repeats. {question}
            </Dialog.Description>
          </div>
          <div data-slot="recurrence-scope-choices" {...stylex.props(styles.choices)}>
            {offeredRecurrenceScopes(scopes).map((scope, index) => (
              <Button
                key={scope}
                ref={index === 0 ? firstChoice : undefined}
                data-scope={scope}
                label={scopeLabels[scope]}
                variant="secondary"
                size="lg"
                xstyle={styles.choice}
                onClick={() => {
                  if (open) onResolve(scope);
                }}
              />
            ))}
          </div>
          <div data-slot="dialog-footer" {...stylex.props(styles.footer)}>
            <Dialog.Close
              data-slot="dialog-close"
              render={<Button label="Cancel" variant="secondary" />}
            />
          </div>
          <ClosedSignal onClosed={onClosed} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
