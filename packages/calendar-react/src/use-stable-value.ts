import { useState } from "react";

/** Returns the previous value while `isEqual` considers the next one equivalent. */
export function useStableValue<T>(value: T, isEqual: (previous: T, next: T) => boolean): T {
  const [stable, setStable] = useState(value);
  if (stable === value || isEqual(stable, value)) return stable;
  setStable(() => value);
  return value;
}
