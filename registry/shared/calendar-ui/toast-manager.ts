import { createToaster, type Toaster } from "@ui-sdk/core/toast";

/** A toast to show, in Base UI's terms. */
export interface ToastOptions {
  /** Reuses a toast: one with this id still on screen is updated in place. */
  readonly id?: string;
  readonly title: string;
  /** Read after the title, as more detail. */
  readonly description?: string;
  /** How long it stays, in milliseconds; `0` keeps it until it's dismissed. */
  readonly timeout?: number;
  /** A button that does something, such as Undo. Pressing it leaves the toast open. */
  readonly actionProps?: {
    readonly children: string;
    /** `input` says whether a key, a pointer or an agent pressed it. */
    readonly onClick: (details: { readonly input: "agent" | "keyboard" | "pointer" }) => void;
  };
  /** Runs once it has closed. */
  readonly onRemove?: () => void;
}

/** Adds and closes the toasts a `ToastViewport` shows, like Base UI's `Toast.createToastManager()`. */
export interface ToastManager {
  /** Shows a toast, or updates the one with its `id`, and returns its id. */
  add(toast: ToastOptions): string;
  close(id: string): void;
}

const toasters = new WeakMap<ToastManager, Toaster<string>>();

export function createToastManager(): ToastManager {
  const toaster = createToaster<string>();
  const manager: ToastManager = {
    add: ({ actionProps, description, id, onRemove, timeout, title }) =>
      toaster({
        // Always given: updating a toast merges into it, and one without an action mustn't keep
        // the last one's.
        action:
          actionProps === undefined
            ? undefined
            : {
                dismiss: false,
                label: actionProps.children,
                // A screen reader's virtual click and a script's count as keys, as with a
                // button's `detail` of 0.
                onAction: (_event, { source }) =>
                  actionProps.onClick({
                    input:
                      source === "agent"
                        ? "agent"
                        : source === "mouse" || source === "pen" || source === "touch"
                          ? "pointer"
                          : "keyboard",
                  }),
              },
        description,
        duration: timeout === undefined || timeout > 0 ? timeout : Infinity,
        id,
        onDismiss: onRemove,
        title,
      }),
    close: (id) => toaster.dismiss(id),
  };
  toasters.set(manager, toaster);
  return manager;
}

/** The ui-sdk toaster behind a manager, for the region that shows its toasts. */
export function toasterOf(manager: ToastManager): Toaster<string> | undefined {
  return toasters.get(manager);
}
