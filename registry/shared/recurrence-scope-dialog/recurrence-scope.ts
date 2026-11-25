/**
 * The recurrence dialog's words, its order of choices, its arrow keys and the promise behind its
 * question. Every framework's dialog reads them from here; edit or translate the words in place.
 */

/**
 * Which events a change to one occurrence of a recurring event applies to: `"this"` occurrence
 * alone, `"following"` (it and every later one), or `"all"` of the series.
 *
 * The same union as `RecurrenceEditScope` from `@moltenship/calendar-recurrence`, declared here so
 * the registry source depends on nothing but the calendar's facade. The two match structurally,
 * so a scope from this dialog passes straight to `resolveRecurrenceEdit`.
 */
export type RecurrenceEditScope = "this" | "following" | "all";

/** What the pending change does; it picks the dialog's title and question. */
export type RecurrenceScopeAction = "edit" | "delete";

/** The order the dialog lists scopes in, from the narrowest to the whole series. */
const scopeOrder: readonly RecurrenceEditScope[] = ["this", "following", "all"];

/** What each choice says. */
export const recurrenceScopeLabels: Readonly<Record<RecurrenceEditScope, string>> = {
  this: "This event",
  following: "This and following events",
  all: "All events",
};

/** The dismiss button's text. */
export const recurrenceScopeCancelLabel = "Cancel";

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

/** The dialog's title, and the description that asks the question about `eventTitle`. */
export function recurrenceScopeText(
  action: RecurrenceScopeAction = "edit",
  eventTitle?: string,
): { readonly description: string; readonly title: string } {
  const { question, title } = actionCopy[action];
  const subject = eventTitle === undefined ? "This event" : `“${eventTitle}”`;
  return { description: `${subject} repeats. ${question}`, title };
}

/**
 * The scopes the dialog offers for `scopes`, in display order: this, following, all, whatever
 * order they are given in. Duplicates and unknown values drop out; no `scopes` means all three.
 */
export function offeredRecurrenceScopes(
  scopes?: readonly RecurrenceEditScope[],
): readonly RecurrenceEditScope[] {
  return scopes === undefined ? scopeOrder : scopeOrder.filter((scope) => scopes.includes(scope));
}

/** How far each arrow key moves along the choices, left to right. */
const arrowSteps: Readonly<Record<string, readonly [step: 1 | -1, horizontal: boolean]>> = {
  ArrowDown: [1, false],
  ArrowLeft: [-1, true],
  ArrowRight: [1, true],
  ArrowUp: [-1, false],
};

/** What `moveBetweenRecurrenceScopes` reads from a key event, in either framework. */
export interface ChoiceKeyEvent {
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly defaultPrevented: boolean;
  readonly key: string;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly target: EventTarget | null;
  preventDefault(): void;
}

/**
 * Moves focus between the dialog's choices with the arrow keys, wrapping at the ends: Up and Down,
 * and Left and Right as the writing direction runs. Safari skips buttons on Tab unless a setting
 * says otherwise, so the arrows reach every choice there; Tab works as the browser has it.
 * `choices` holds the buttons, each with a `data-scope`.
 */
export function moveBetweenRecurrenceScopes(event: ChoiceKeyEvent, choices: HTMLElement): void {
  const arrow = arrowSteps[event.key];
  if (arrow === undefined || event.defaultPrevented) return;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const buttons = [...choices.querySelectorAll<HTMLElement>("[data-scope]")];
  const index = buttons.findIndex((button) => button.contains(event.target as Node | null));
  if (index === -1) return;
  const [forward, horizontal] = arrow;
  const step = horizontal && getComputedStyle(choices).direction === "rtl" ? -forward : forward;
  event.preventDefault();
  buttons[(index + step + buttons.length) % buttons.length]!.focus();
}

/** What to ask about a pending change to an occurrence of a recurring event. */
export interface RecurrenceScopeQuestion {
  /** An edit (move, resize, update) or a delete; picks the copy. Defaults to `"edit"`. */
  readonly action?: RecurrenceScopeAction;
  /** The event's title, quoted in the question. */
  readonly eventTitle?: string;
  /**
   * The scopes to offer, shown in a fixed order: this, following, all. Defaults to all three.
   * With none, `ask` resolves `null` at once and shows nothing.
   */
  readonly scopes?: readonly RecurrenceEditScope[];
}

/** What the dialog shows. */
export interface RecurrenceScopePromptState {
  readonly open: boolean;
  /** Kept after an answer, so the dialog keeps its copy while it animates closed. */
  readonly question: RecurrenceScopeQuestion;
}

export const closedRecurrenceScopePrompt: RecurrenceScopePromptState = {
  open: false,
  question: {},
};

/** The question as a promise, which each framework's prompt hook binds to its dialog. */
export interface RecurrenceScopeQuestions {
  /**
   * Opens the dialog and resolves with the scope picked, or `null` when it is cancelled, once the
   * dialog has closed and focus is back where it was. Asking again while it is open resolves the
   * earlier question with `null`, as does unmounting; an answer still closing is handed over at
   * once.
   */
  readonly ask: (question?: RecurrenceScopeQuestion) => Promise<RecurrenceEditScope | null>;
  /** The dialog's `onResolve`: the scope picked, or `null` when it was dismissed. */
  readonly answer: (scope: RecurrenceEditScope | null) => void;
  /** The dialog's `onClosed`: hands the answer over once focus is back. */
  readonly closed: () => void;
  /** Starts answering while the dialog is on the page, and returns what cancels on unmount. */
  readonly connect: () => () => void;
}

/** The questions behind a prompt, which calls `show` with each state the dialog should show. */
export function createRecurrenceScopeQuestions(
  show: (state: RecurrenceScopePromptState) => void,
): RecurrenceScopeQuestions {
  let state = closedRecurrenceScopePrompt;
  /** Resolves the open question until it is answered. */
  let pending: ((scope: RecurrenceEditScope | null) => void) | null = null;
  /** Hands over an answer once the dialog has closed. */
  let answered: (() => void) | null = null;
  let connected = true;

  const update = (next: RecurrenceScopePromptState) => {
    state = next;
    show(next);
  };
  const close = () => {
    if (state.open) update({ ...state, open: false });
  };
  /** Hands over an answer that is still closing. */
  const handOver = () => {
    const answer = answered;
    answered = null;
    answer?.();
  };
  /** Takes the open question's resolver, so only one answer reaches it. */
  const takePending = () => {
    const resolve = pending;
    pending = null;
    return resolve;
  };
  /** Hands over an answer, and cancels a question that has none. */
  const settle = () => {
    handOver();
    takePending()?.(null);
  };

  return {
    ask(question = {}) {
      // A newer question replaces the open one, which counts as cancelled; an answer still
      // closing goes now.
      settle();
      if (!connected) return Promise.resolve(null);
      if (offeredRecurrenceScopes(question.scopes).length === 0) {
        close();
        return Promise.resolve(null);
      }
      return new Promise((resolve) => {
        pending = resolve;
        update({ open: true, question });
      });
    },
    answer(scope) {
      const resolve = takePending();
      // The answer waits for focus to be back on the event: applying it can replace the event.
      if (resolve !== null) answered = () => resolve(scope);
      close();
    },
    closed: handOver,
    connect() {
      connected = true;
      return () => {
        connected = false;
        settle();
      };
    },
  };
}
