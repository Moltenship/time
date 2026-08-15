import type { ProfilerOnRenderCallback } from "react";

export interface TestCounter {
  readonly value: number;
  increment(): void;
  reset(): void;
}

export function createTestCounter(): TestCounter {
  let value = 0;

  return Object.freeze({
    get value() {
      return value;
    },
    increment() {
      value += 1;
    },
    reset() {
      value = 0;
    },
  });
}

export function createCommitCounter(): Readonly<{
  counter: TestCounter;
  onRender: ProfilerOnRenderCallback;
}> {
  const counter = createTestCounter();
  return Object.freeze({
    counter,
    onRender: () => counter.increment(),
  });
}

export function createSelectorCounter<TState, TSelected>(
  select: (state: TState) => TSelected,
): Readonly<{ counter: TestCounter; select: (state: TState) => TSelected }> {
  const counter = createTestCounter();
  return Object.freeze({
    counter,
    select(state: TState) {
      counter.increment();
      return select(state);
    },
  });
}
