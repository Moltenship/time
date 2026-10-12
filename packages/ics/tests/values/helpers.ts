import { expect } from "vite-plus/test";

import type { IcsDecodeResult } from "../../src/values";

/** The value of a clean success: ok and without a warning. */
export function decoded<T>(result: IcsDecodeResult<T>): T {
  expect(result).toMatchObject({ ok: true });
  expect(result).not.toHaveProperty("warning");
  return (result as { readonly value: T }).value;
}

/** The value of a lenient success, whose warning must match `warning`. */
export function lenient<T>(result: IcsDecodeResult<T>, warning: RegExp): T {
  expect(result).toMatchObject({ ok: true, warning: expect.stringMatching(warning) });
  return (result as { readonly value: T }).value;
}

export function rejected(result: IcsDecodeResult<unknown>): string {
  expect(result).toMatchObject({ message: expect.any(String), ok: false });
  return (result as { readonly message: string }).message;
}

/**
 * Temporal objects have no own properties, so `toEqual` would call any two of them equal. This
 * replaces each with its type and `toString()`, deeply, for comparisons.
 */
export function plain(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(plain);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }

  const tag = Object.prototype.toString.call(value);
  if (tag.startsWith("[object Temporal.")) {
    return `${tag.slice(8, -1)} ${(value as { toString(): string }).toString()}`;
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]));
}
