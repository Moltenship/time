/** Reports an application callback's error without failing what it was told about. */
export function reportCallbackError(error: unknown): void {
  if (typeof reportError === "function") reportError(error);
  else console.error(error);
}
