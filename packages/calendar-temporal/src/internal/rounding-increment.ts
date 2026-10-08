/** Rejects increments that native Temporal would silently truncate, such as `1.5`. */
export function assertRoundingIncrement(increment: number, errorCode: string): void {
  if (!Number.isSafeInteger(increment) || increment < 1) {
    throw new RangeError(errorCode);
  }
}
