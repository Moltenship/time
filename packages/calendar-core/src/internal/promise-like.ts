export function isPromiseLike<TValue>(value: unknown): value is PromiseLike<TValue> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { readonly then?: unknown }).then === "function"
  );
}
