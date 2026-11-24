import type { CalendarStateSource } from "@moltenship/calendar-primitives";

export interface TestStore<TState> extends CalendarStateSource<TState> {
  readonly listeners: number;
  set(next: TState): void;
}

export function createTestStore<TState>(
  initial: TState,
  serverSnapshot?: TState,
): TestStore<TState> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get listeners() {
      return listeners.size;
    },
    ...(serverSnapshot === undefined ? {} : { getServerSnapshot: () => serverSnapshot }),
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    set(next) {
      state = next;
      for (const listener of listeners) listener();
    },
  };
}
