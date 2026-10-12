import { expect } from "vite-plus/test";

import type { IcsIssueCode } from "../../src/index";
import type { IcsDecodeResult } from "../../src/values";

/** The value of a clean success: ok and without warnings. */
export function decoded<T>(result: IcsDecodeResult<T>): T {
  expect(result).toMatchObject({ ok: true });
  expect(result).not.toHaveProperty("warnings");
  return (result as { readonly value: T }).value;
}

/** The value of a lenient success, one of whose warnings must match `warning` and have `code`. */
export function lenient<T>(
  result: IcsDecodeResult<T>,
  warning: RegExp,
  code: IcsIssueCode = "invalid-value",
): T {
  expect(result).toMatchObject({
    ok: true,
    warnings: expect.arrayContaining([{ code, message: expect.stringMatching(warning) }]),
  });
  return (result as { readonly value: T }).value;
}

/** The warnings' messages, in order. */
export function warningsOf(result: IcsDecodeResult<unknown>): readonly string[] {
  expect(result).toMatchObject({ ok: true });
  return ((result as { readonly warnings?: readonly { message: string }[] }).warnings ?? []).map(
    ({ message }) => message,
  );
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
