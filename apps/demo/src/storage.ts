import { useEffect, useState } from "react";

// Storage can be unavailable (private browsing, quota); the demo then keeps state in memory.
export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Keep the in-memory value.
  }
}

export function usePersistentState<T>(
  key: string,
  load: (stored: string | null) => T,
  serialize: (value: T) => string,
) {
  const [value, setValue] = useState(() => load(readStorage(key)));

  useEffect(() => writeStorage(key, serialize(value)), [key, serialize, value]);

  return [value, setValue] as const;
}
